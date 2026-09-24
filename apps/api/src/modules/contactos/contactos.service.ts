import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ContactoVistaCliente, ContactoVistaProfesional } from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { EventosService } from "../eventos/eventos.service.js";
import { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import {
  puedeSeleccionar,
  transicionar as transicionarPedido,
} from "../pedidos/pedidos.estados.js";
import { transicionar as transicionarPostulacion } from "../postulaciones/postulaciones.estados.js";
import {
  mapearContactoAVistaCliente,
  mapearContactoAVistaProfesional,
  type ContactoConProfesional,
} from "./contactos.vistas.js";

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

const INCLUDE_CONTACTO_CLIENTE = {
  postulacion: {
    include: {
      profesional: {
        include: {
          usuario: { select: { nombre: true, apellido: true, fotoUrl: true, telefono: true } },
        },
      },
    },
  },
} as const;

/**
 * CL-08/CL-10/PR-06 (docs/dominio.md §4, §7, §9, §12 D2/D3). Reglas no
 * negociables tocadas: #1 (transicionar), #2 (visibilidad/vistas), #4 (cupo
 * de elegibles con lock), #8 (eventos de analitica).
 */
@Injectable()
export class ContactosService {
  private readonly logger = new Logger(ContactosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly eventos: EventosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** CL-08: el cliente elige una postulacion de su pedido. */
  async seleccionar(usuarioId: string, postulacionId: string): Promise<ContactoVistaCliente> {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { id: postulacionId },
      include: {
        pedido: { include: { categoria: true, barrio: true } },
        profesional: { select: { usuarioId: true } },
      },
    });
    if (!postulacion) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La postulación no existe" });
    }
    // Mismo criterio que el resto del codigo: no revela que existe si no es
    // del cliente dueno del pedido.
    if (postulacion.pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La postulación no existe" });
    }
    if (postulacion.estado !== "enviada" && postulacion.estado !== "vista") {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Esta postulación ya no se puede elegir",
      });
    }

    const [seleccionablesMax, cierreAutomaticoDias] = await Promise.all([
      this.parametros.getNumero("seleccionables_max_por_pedido"),
      this.parametros.getNumero("cierre_automatico_dias"),
    ]);

    // Atajo pre-transaccion (mismo patron que PostulacionesService.crear):
    // responde rapido en el caso comun. El chequeo que realmente previene la
    // carrera es el de abajo, dentro de la transaccion con lock.
    if (!puedeSeleccionar(postulacion.pedido, seleccionablesMax)) {
      throw new ConflictException({
        codigo: "limite_excedido",
        mensaje: "Ya elegiste al máximo de profesionales para este pedido",
      });
    }

    const pedidoId = postulacion.pedidoId;

    const {
      contactoId,
      eraPrimeraSeleccion,
      cupoCompletado,
      profesionalesCaducados,
      otrosProfesionalesVivos,
    } = await this.prisma.$transaction(async (tx) => {
      // Regla no negociable #4: maximo de seleccionados con lock sobre el
      // pedido (mismo patron que PostulacionesService.crear).
      await tx.$queryRaw`SELECT id FROM pedido WHERE id = ${pedidoId} FOR UPDATE`;
      const pedidoFresco = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId } });

      if (!puedeSeleccionar(pedidoFresco, seleccionablesMax)) {
        throw new ConflictException({
          codigo: "limite_excedido",
          mensaje: "Ya elegiste al máximo de profesionales para este pedido",
        });
      }

      const nuevoOrden = pedidoFresco.cantidadContactos + 1;
      // Se calcula sobre la lectura fresca dentro del lock, no sobre la de
      // antes de la transaccion: dos selecciones concurrentes en un pedido
      // sin contacto todavia podian leer las dos "era la primera" y duplicar
      // el evento/notificacion de "contacto_habilitado".
      const eraPrimeraSeleccion = pedidoFresco.estado !== "contacto_habilitado";

      await transicionarPostulacion(tx, postulacionId, postulacion.estado, "seleccionada");

      const contacto = await tx.contacto.create({
        data: { pedidoId, postulacionId, orden: nuevoOrden },
      });

      // El pedido entra una sola vez a "contacto_habilitado" (D2/D3): la
      // primera seleccion transiciona y fija cierreAutomaticoEn; la 2 y 3
      // solo incrementan el contador con un update simple.
      if (pedidoFresco.estado === "contacto_habilitado") {
        await tx.pedido.update({
          where: { id: pedidoId },
          data: { cantidadContactos: { increment: 1 } },
        });
      } else {
        await transicionarPedido(tx, pedidoId, pedidoFresco.estado, "contacto_habilitado", {
          cantidadContactos: { increment: 1 },
          cierreAutomaticoEn: new Date(Date.now() + cierreAutomaticoDias * MILISEGUNDOS_POR_DIA),
        });
      }

      // D2: las demas postulaciones vivas siguen vivas mientras quede cupo;
      // caducan todas juntas recien cuando esta seleccion completa el cupo.
      if (nuevoOrden === seleccionablesMax) {
        const restantes = await tx.postulacion.findMany({
          where: { pedidoId, estado: { in: ["enviada", "vista"] } },
          include: { profesional: { select: { usuarioId: true } } },
        });
        for (const restante of restantes) {
          await transicionarPostulacion(tx, restante.id, restante.estado, "caducada");
        }
        return {
          contactoId: contacto.id,
          eraPrimeraSeleccion,
          cupoCompletado: true,
          profesionalesCaducados: restantes.map((restante) => restante.profesional.usuarioId),
          otrosProfesionalesVivos: [] as string[],
        };
      }

      const vivas = await tx.postulacion.findMany({
        where: { pedidoId, estado: { in: ["enviada", "vista"] }, id: { not: postulacionId } },
        include: { profesional: { select: { usuarioId: true } } },
      });
      return {
        contactoId: contacto.id,
        eraPrimeraSeleccion,
        cupoCompletado: false,
        profesionalesCaducados: [] as string[],
        otrosProfesionalesVivos: vivas.map((viva) => viva.profesional.usuarioId),
      };
    });

    await this.registrarEventoSeguro({
      tipo: "profesional_seleccionado",
      categoria: postulacion.pedido.categoria.slug,
      zona: postulacion.pedido.barrio.nombre,
      rol: "cliente",
      usuarioId,
      pedidoId,
    });

    // docs/dominio.md §9: "Contacto habilitado | Cliente | Push | Al
    // seleccionar" — solo en la primera seleccion, porque es cuando el pedido
    // realmente entra a ese estado (D2/D3).
    if (eraPrimeraSeleccion) {
      await this.registrarEventoSeguro({
        tipo: "contacto_habilitado",
        categoria: postulacion.pedido.categoria.slug,
        zona: postulacion.pedido.barrio.nombre,
        rol: "cliente",
        usuarioId,
        pedidoId,
      });
      await this.crearNotificacionSegura({
        usuarioId,
        tipo: "contacto_habilitado",
        objetoId: pedidoId,
      });
    }

    await this.crearNotificacionSegura({
      usuarioId: postulacion.profesional.usuarioId,
      tipo: "postulacion_seleccionada",
      objetoId: postulacionId,
    });

    if (cupoCompletado) {
      await this.crearVariasNotificacionesSeguras(
        profesionalesCaducados.map((idUsuario) => ({
          usuarioId: idUsuario,
          tipo: "cliente_completo_eleccion",
          objetoId: pedidoId,
        })),
      );
    } else {
      await this.crearVariasNotificacionesSeguras(
        otrosProfesionalesVivos.map((idUsuario) => ({
          usuarioId: idUsuario,
          tipo: "cliente_eligio_a_otro",
          objetoId: pedidoId,
        })),
      );
    }

    const contactoCreado = await this.prisma.contacto.findUniqueOrThrow({
      where: { id: contactoId },
      include: INCLUDE_CONTACTO_CLIENTE,
    });
    return mapearContactoAVistaCliente(contactoCreado as ContactoConProfesional);
  }

  /** CL-10: los contactos habilitados del pedido, para su cliente dueno. */
  async obtenerDelPedido(usuarioId: string, pedidoId: string): Promise<ContactoVistaCliente[]> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { clienteId: true },
    });
    if (!pedido || pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    const contactos = await this.prisma.contacto.findMany({
      where: { pedidoId },
      orderBy: { orden: "asc" },
      include: INCLUDE_CONTACTO_CLIENTE,
    });

    return contactos.map((contacto) =>
      mapearContactoAVistaCliente(contacto as ContactoConProfesional),
    );
  }

  /** PR-06: el detalle del contacto para el profesional elegido. */
  async obtenerElegido(
    usuarioId: string,
    postulacionId: string,
  ): Promise<ContactoVistaProfesional> {
    const perfil = await this.prisma.perfilProfesional.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    if (!perfil) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "No encontramos ese contacto",
      });
    }

    const postulacion = await this.prisma.postulacion.findUnique({
      where: { id: postulacionId },
      include: {
        contacto: {
          include: {
            pedido: {
              include: {
                categoria: true,
                direccion: true,
                barrio: true,
                cliente: { select: { nombre: true, apellido: true, telefono: true } },
              },
            },
          },
        },
      },
    });

    if (!postulacion || postulacion.profesionalId !== perfil.id || !postulacion.contacto) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "No encontramos ese contacto",
      });
    }

    const hayOtrosElegidos = postulacion.contacto.pedido.cantidadContactos > 1;
    return mapearContactoAVistaProfesional(
      { ...postulacion.contacto, postulacion: { estado: postulacion.estado } },
      { hayOtrosElegidos },
    );
  }

  /** PR-06/CL-10: abrir WhatsApp o iniciar una llamada desde la pantalla de contacto. */
  async registrarEventoContacto(
    usuarioId: string,
    postulacionId: string,
    tipo: "whatsapp_abierto" | "llamada_iniciada",
  ): Promise<void> {
    const contacto = await this.prisma.contacto.findUnique({
      where: { postulacionId },
      include: {
        pedido: { include: { categoria: true, barrio: true } },
        postulacion: { include: { profesional: { select: { usuarioId: true } } } },
      },
    });
    if (!contacto) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "No encontramos ese contacto",
      });
    }

    let rol: "cliente" | "profesional";
    if (contacto.pedido.clienteId === usuarioId) {
      rol = "cliente";
    } else if (contacto.postulacion.profesional.usuarioId === usuarioId) {
      rol = "profesional";
    } else {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "No encontramos ese contacto",
      });
    }

    await this.registrarEventoSeguro({
      tipo,
      categoria: contacto.pedido.categoria.slug,
      zona: contacto.pedido.barrio.nombre,
      rol,
      usuarioId,
      pedidoId: contacto.pedidoId,
    });

    // Solo se usa para el aviso a las 48 h ("¿Pudiste contactarte?") del lado
    // del cliente: no pisa la fecha si ya estaba seteada.
    if (tipo === "whatsapp_abierto" && rol === "cliente") {
      await this.prisma.contacto.update({
        where: { id: contacto.id },
        data: { abiertoWhatsappEn: contacto.abiertoWhatsappEn ?? new Date() },
      });
    }
  }

  /** La analitica nunca puede tumbar una accion de negocio ya resuelta (mismo criterio que PostulacionesService). */
  private async registrarEventoSeguro(
    datos: Parameters<EventosService["registrar"]>[0],
  ): Promise<void> {
    try {
      await this.eventos.registrar(datos);
    } catch (error) {
      this.logger.warn(`No se pudo registrar el evento "${datos.tipo}": ${String(error)}`);
    }
  }

  private async crearNotificacionSegura(
    datos: Parameters<NotificacionesService["crear"]>[0],
  ): Promise<void> {
    try {
      await this.notificaciones.crear(datos);
    } catch (error) {
      this.logger.warn(`No se pudo crear la notificacion "${datos.tipo}": ${String(error)}`);
    }
  }

  private async crearVariasNotificacionesSeguras(
    datos: Parameters<NotificacionesService["crearVarias"]>[0],
  ): Promise<void> {
    try {
      await this.notificaciones.crearVarias(datos);
    } catch (error) {
      this.logger.warn(`No se pudieron crear notificaciones en lote: ${String(error)}`);
    }
  }
}
