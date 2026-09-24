import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  ContadorDiarioPostulaciones,
  CrearPostulacion,
  EstadoPedido,
  EstadoPostulacion,
  GrupoEstadoPostulacion,
  ListarPostulacionesQuery,
  PostulacionesPagina,
  PostulacionVistaCliente,
  PostulacionVistaProfesional,
} from "@fixeo/shared";
import { detectarDatosDeContacto } from "@fixeo/shared";
import { Prisma } from "../../generated/prisma/client.js";
import type { PerfilProfesional } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { EventosService } from "../eventos/eventos.service.js";
import { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import {
  puedeRecibirPostulaciones,
  transicionar as transicionarPedido,
} from "../pedidos/pedidos.estados.js";
import { inicioDelDiaEnZona, proximaMedianocheEnZona } from "./fecha-zona.util.js";
import { transicionar as transicionarPostulacion } from "./postulaciones.estados.js";
import {
  mapearPostulacionAVistaCliente,
  mapearPostulacionAVistaProfesional,
  type PostulacionConProfesional,
} from "./postulaciones.vistas.js";

const PERFIL_NO_ARMADO = {
  codigo: "no_encontrado" as const,
  mensaje: "Todavía no armaste tu perfil profesional",
};

const TAMANIO_PAGINA = 20;

// PR-05: "Pestañas enviadas, seleccionadas, cerradas" -> estados de Postulacion.
const ESTADOS_POR_GRUPO: Record<GrupoEstadoPostulacion, EstadoPostulacion[]> = {
  enviadas: ["enviada", "vista"],
  seleccionadas: ["seleccionada"],
  cerradas: ["descartada", "retirada", "caducada"],
};

const INCLUDE_PEDIDO_CATEGORIA = { pedido: { include: { categoria: true } } } as const;

const INCLUDE_PROFESIONAL_USUARIO = {
  profesional: {
    include: { usuario: { select: { nombre: true, apellido: true, fotoUrl: true } } },
  },
} as const;

/**
 * PR-04/PR-05/CL-08 (docs/dominio.md §4, §6 ultimo bloque, §7). Reglas no
 * negociables tocadas: #4 (cupos con lock), #5 (identidad y matricula
 * verificadas), #6 (datos de contacto en mensaje/disponibilidad).
 */
@Injectable()
export class PostulacionesService {
  private readonly logger = new Logger(PostulacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly eventos: EventosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async crear(usuarioId: string, datos: CrearPostulacion): Promise<PostulacionVistaProfesional> {
    const perfil = await this.prisma.perfilProfesional.findUnique({
      where: { usuarioId },
      include: { oficios: { include: { categoria: true } } },
    });
    if (!perfil) {
      throw new NotFoundException(PERFIL_NO_ARMADO);
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: datos.pedidoId },
      include: { categoria: true, barrio: true },
    });
    if (!pedido) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    // Bloqueante 2 (revision de codigo del slice 6): una cuenta con los dos
    // roles no puede postularse a su propio pedido. Mismo criterio (404, no
    // revela nada distinto) que ya usa pedidos-feed.service.ts para el mismo
    // caso en el camino de lectura.
    if (pedido.clienteId === usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    // Regla no negociable #5: postular exige identidad verificada.
    if (perfil.estadoVerificacion !== "aprobada") {
      throw new ForbiddenException({
        codigo: "no_autorizado",
        mensaje: "Necesitás tener tu identidad verificada para postularte",
      });
    }

    // Un profesional que pauso su perfil para dejar de recibir trabajo no
    // deberia poder seguir postulandose por otro camino (ej. un link directo
    // a un pedido). A proposito no valida la zona de cobertura configurada:
    // eso es una decision de alcance a proposito distinta.
    if (perfil.pausado) {
      throw new ForbiddenException({
        codigo: "no_autorizado",
        mensaje: "No podés postularte con el perfil pausado",
      });
    }

    const oficio = perfil.oficios.find((oficio) => oficio.categoriaId === pedido.categoriaId);
    if (!oficio) {
      throw new ForbiddenException({
        codigo: "no_autorizado",
        mensaje: "No tenés ese oficio configurado en tu perfil",
      });
    }

    // Regla no negociable #5: en gas y electricidad, matricula validada y
    // vigente. Recomendada/no exigida (aire acondicionado y el resto) no bloquean.
    if (pedido.categoria.requiereMatricula === "obligatoria") {
      const matriculaVigente =
        oficio.matriculaEstado === "validada" &&
        (oficio.matriculaVenceEn === null || oficio.matriculaVenceEn > new Date());
      if (!matriculaVigente) {
        throw new ForbiddenException({
          codigo: "no_autorizado",
          mensaje: "Necesitás la matrícula validada y vigente para postularte en esta categoría",
        });
      }
    }

    // Regla no negociable #6: se rechaza, a diferencia de la descripcion del
    // pedido (que manda a revision): no existe una cola de revision de
    // postulaciones.
    if (this.hayDatosDeContacto(datos.mensaje, datos.disponibilidad)) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "Revisá el mensaje: parece tener un teléfono, email o usuario de redes",
      });
    }

    const [seleccionablesMax, postulacionesMax, limiteDiario, zonaHoraria] = await Promise.all([
      this.parametros.getNumero("seleccionables_max_por_pedido"),
      this.parametros.getNumero("postulaciones_max_por_pedido"),
      this.parametros.getNumero("postulaciones_max_por_profesional_dia"),
      this.parametros.getTexto("limite_diario_zona_horaria"),
    ]);

    if (!puedeRecibirPostulaciones(pedido, seleccionablesMax, postulacionesMax)) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este pedido ya no acepta postulaciones",
      });
    }

    const yaPostulado = await this.prisma.postulacion.findUnique({
      where: { pedidoId_profesionalId: { pedidoId: pedido.id, profesionalId: perfil.id } },
      select: { id: true },
    });
    if (yaPostulado) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Ya te postulaste a este pedido",
      });
    }

    let eraPrimeraPostulacion = false;
    let postulacionCreada;
    let pedidoFrescoFinal;
    try {
      ({ postulacion: postulacionCreada, pedidoFresco: pedidoFrescoFinal } =
        await this.prisma.$transaction(async (tx) => {
          // Regla no negociable #4: cupo por pedido (8) con lock. Mismo patron
          // que PedidosService.crear (lock sobre el recurso disputado, releer
          // fresco dentro de la transaccion).
          await tx.$queryRaw`SELECT id FROM pedido WHERE id = ${pedido.id} FOR UPDATE`;
          const pedidoFresco = await tx.pedido.findUniqueOrThrow({ where: { id: pedido.id } });

          // Bloqueante 1 (revision de codigo del slice 6): el chequeo de mas
          // arriba (antes de la transaccion) es solo un atajo para responder
          // rapido en el caso comun; este es el que realmente previene la
          // condicion de carrera, porque corre sobre una lectura fresca con
          // lock. Si el pedido cambio de estado (se cancelo, expiro, se
          // bloqueo, o complete su cupo de elegibles) justo entre la lectura de
          // arriba y esta transaccion, se detecta aca, antes de crear la
          // Postulacion.
          if (!puedeRecibirPostulaciones(pedidoFresco, seleccionablesMax, postulacionesMax)) {
            throw new ConflictException({
              codigo: "conflicto",
              mensaje: "Este pedido ya no acepta postulaciones",
            });
          }

          if (pedidoFresco.cantidadPostulaciones >= postulacionesMax) {
            throw new ConflictException({
              codigo: "limite_excedido",
              mensaje: "Este pedido ya alcanzó el máximo de postulaciones",
            });
          }

          // Regla no negociable #4: limite diario del profesional (10) con
          // lock, mismo orden pedido -> perfil en todas las llamadas para no
          // generar deadlocks entre dos postulaciones concurrentes.
          await tx.$queryRaw`SELECT id FROM perfil_profesional WHERE id = ${perfil.id} FOR UPDATE`;
          const inicioDeHoy = inicioDelDiaEnZona(new Date(), zonaHoraria);
          const postulacionesHoy = await tx.postulacion.count({
            where: { profesionalId: perfil.id, enviadaEn: { gte: inicioDeHoy } },
          });
          if (postulacionesHoy >= limiteDiario) {
            throw new ConflictException({
              codigo: "limite_excedido",
              mensaje: "Alcanzaste el máximo de postulaciones de hoy",
            });
          }

          eraPrimeraPostulacion = pedidoFresco.estado === "publicado";
          if (eraPrimeraPostulacion) {
            await transicionarPedido(tx, pedido.id, "publicado", "con_postulaciones", {
              cantidadPostulaciones: { increment: 1 },
            });
          } else {
            await tx.pedido.update({
              where: { id: pedido.id },
              data: { cantidadPostulaciones: { increment: 1 } },
            });
          }

          try {
            const postulacion = await tx.postulacion.create({
              data: {
                pedidoId: pedido.id,
                profesionalId: perfil.id,
                mensaje: datos.mensaje,
                estimacionADefinir: datos.estimacion.aDefinir,
                estimacionMin: datos.estimacion.aDefinir ? null : datos.estimacion.minimo,
                estimacionMax: datos.estimacion.aDefinir ? null : datos.estimacion.maximo,
                disponibilidad: datos.disponibilidad ?? null,
              },
            });
            // Importante (revision de codigo del slice 6, segunda pasada): la
            // respuesta del POST tiene que reflejar el pedido tal como quedo
            // despues de esta misma transaccion (ej. "con_postulaciones" en la
            // primera postulacion), no la lectura de antes del lock.
            return { postulacion, pedidoFresco };
          } catch (error) {
            // Defensa en profundidad detras del chequeo previo (mismo patron
            // que el P2002 de foto_pedido en PedidosService): dos POST
            // concurrentes del mismo profesional al mismo pedido pueden pasar
            // el findUnique previo los dos y competir por la unique constraint.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
              throw new ConflictException({
                codigo: "conflicto",
                mensaje: "Ya te postulaste a este pedido",
              });
            }
            throw error;
          }
        }));
    } catch (error) {
      // Mismo criterio que PedidosService: la analitica nunca puede tumbar
      // una accion de negocio ya resuelta.
      if (
        error instanceof ConflictException &&
        (error.getResponse() as { codigo?: string }).codigo === "limite_excedido"
      ) {
        await this.registrarEventoSeguro({
          tipo: "limite_alcanzado",
          categoria: pedido.categoria.slug,
          zona: pedido.barrio.nombre,
          rol: "profesional",
          usuarioId,
          pedidoId: pedido.id,
        });
      }
      throw error;
    }

    await this.registrarEventoSeguro({
      tipo: "postulacion_enviada",
      categoria: pedido.categoria.slug,
      zona: pedido.barrio.nombre,
      rol: "profesional",
      usuarioId,
      pedidoId: pedido.id,
    });

    // docs/dominio.md §9: "Primera postulacion | Cliente | Push + WhatsApp |
    // Al llegar". Sin canal real todavia (igual que el resto del proyecto):
    // solo el registro en `notificacion`.
    if (eraPrimeraPostulacion) {
      await this.crearNotificacionSegura({
        usuarioId: pedido.clienteId,
        tipo: "primera_postulacion",
        objetoId: pedido.id,
      });
    }

    // Importante (revision de codigo, segunda pasada): `categoria`/`barrio`
    // no cambian, pero `estado`/`cantidadContactos` si pueden haber cambiado
    // dentro de la transaccion (ej. paso a "con_postulaciones"): la vista
    // tiene que reflejar `pedidoFrescoFinal`, no la lectura de antes del lock.
    const pedidoParaVista = { ...pedido, ...pedidoFrescoFinal };
    return mapearPostulacionAVistaProfesional(postulacionCreada, pedidoParaVista, {
      otroYaElegido: this.calcularOtroYaElegido(pedidoParaVista),
    });
  }

  async obtenerContadorDiario(usuarioId: string): Promise<ContadorDiarioPostulaciones> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);
    const [maximo, zonaHoraria] = await Promise.all([
      this.parametros.getNumero("postulaciones_max_por_profesional_dia"),
      this.parametros.getTexto("limite_diario_zona_horaria"),
    ]);

    const ahora = new Date();
    const inicioDeHoy = inicioDelDiaEnZona(ahora, zonaHoraria);
    const usadas = await this.prisma.postulacion.count({
      where: { profesionalId: perfil.id, enviadaEn: { gte: inicioDeHoy } },
    });

    return {
      usadas,
      maximo,
      renuevaEn: proximaMedianocheEnZona(ahora, zonaHoraria).toISOString(),
    };
  }

  async listar(usuarioId: string, query: ListarPostulacionesQuery): Promise<PostulacionesPagina> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);
    const estados = ESTADOS_POR_GRUPO[query.grupo];

    const postulaciones = await this.prisma.postulacion.findMany({
      where: { profesionalId: perfil.id, estado: { in: estados } },
      include: INCLUDE_PEDIDO_CATEGORIA,
      orderBy: [{ enviadaEn: "desc" }, { id: "desc" }],
      take: TAMANIO_PAGINA + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hayMas = postulaciones.length > TAMANIO_PAGINA;
    const pagina = hayMas ? postulaciones.slice(0, TAMANIO_PAGINA) : postulaciones;

    const items = pagina.map((postulacion) =>
      mapearPostulacionAVistaProfesional(postulacion, postulacion.pedido, {
        otroYaElegido: this.calcularOtroYaElegido(postulacion.pedido),
      }),
    );

    return { items, cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null };
  }

  /** PR-05: el profesional retira su propia postulacion. */
  async retirar(usuarioId: string, postulacionId: string): Promise<PostulacionVistaProfesional> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { id: postulacionId },
      include: INCLUDE_PEDIDO_CATEGORIA,
    });
    if (!postulacion || postulacion.profesionalId !== perfil.id) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La postulación no existe" });
    }

    // Bloqueante 7 (revision de codigo del slice 6): PR-05 ("Retirar
    // postulacion") solo cubre el desistimiento del profesional mientras el
    // cliente todavia no lo eligio. Una vez "seleccionada", retirarse tiene
    // efectos reales que este endpoint no maneja (liberar el cupo de
    // elegibles, avisar al cliente): eso es PR-06 ("no puedo tomarlo"), que
    // todavia no existe. La transicion seleccionada -> retirada se deja en
    // postulaciones.estados.ts para cuando se construya ese caso de uso,
    // pero no la puede disparar este metodo.
    if (postulacion.estado !== "enviada" && postulacion.estado !== "vista") {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Esta postulación ya no se puede retirar así",
      });
    }

    // docs/dominio.md §4: "Retirarse seguido afecta su reputacion" — no hay
    // tabla de reputacion todavia (pendiente de un slice futuro), asi que
    // este metodo solo hace la transicion de estado.
    await this.prisma.$transaction((tx) =>
      transicionarPostulacion(tx, postulacion.id, postulacion.estado, "retirada"),
    );

    const actualizada = await this.prisma.postulacion.findUniqueOrThrow({
      where: { id: postulacionId },
      include: INCLUDE_PEDIDO_CATEGORIA,
    });
    return mapearPostulacionAVistaProfesional(actualizada, actualizada.pedido, {
      otroYaElegido: this.calcularOtroYaElegido(actualizada.pedido),
    });
  }

  /**
   * CL-08: postulaciones del pedido, para su cliente dueño. Marca como
   * "vista" (con vistaEn = ahora) todas las que todavia estan "enviada": el
   * cliente las esta abriendo en este mismo request.
   */
  async listarDelPedido(usuarioId: string, pedidoId: string): Promise<PostulacionVistaCliente[]> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { categoria: true, barrio: true },
    });
    if (!pedido || pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    const paraMarcarVistas = await this.prisma.postulacion.findMany({
      where: { pedidoId, estado: "enviada" },
      select: { id: true },
    });
    if (paraMarcarVistas.length > 0) {
      const ahora = new Date();
      await this.prisma.$transaction(async (tx) => {
        for (const { id } of paraMarcarVistas) {
          await transicionarPostulacion(tx, id, "enviada", "vista", { vistaEn: ahora });
        }
      });
      // docs/dominio.md §10: un evento por request, no uno por fila.
      await this.registrarEventoSeguro({
        tipo: "postulacion_vista",
        categoria: pedido.categoria.slug,
        zona: pedido.barrio.nombre,
        rol: "cliente",
        usuarioId,
        pedidoId,
      });
    }

    const descarteReversibleHoras = await this.parametros.getNumero("descarte_reversible_horas");
    const ahoraMs = Date.now();

    // docs/pantallas.md CL-08 pide "orden por relevancia, estimacion o
    // reputacion", pero no hay un criterio de relevancia definido ni tabla
    // Resenia todavia (slice 8): se ordena por orden de llegada. Afinar
    // cuando exista reputacion real.
    const postulaciones = await this.prisma.postulacion.findMany({
      where: { pedidoId },
      include: INCLUDE_PROFESIONAL_USUARIO,
      orderBy: [{ enviadaEn: "asc" }, { id: "asc" }],
    });

    return postulaciones.map((postulacion) =>
      mapearPostulacionAVistaCliente(postulacion as PostulacionConProfesional, {
        ahoraMs,
        descarteReversibleHoras,
      }),
    );
  }

  /** CL-08: el cliente descarta una postulacion de su pedido. */
  async descartar(usuarioId: string, postulacionId: string): Promise<PostulacionVistaCliente> {
    const postulacion = await this.buscarPostulacionDelClienteOrThrow(usuarioId, postulacionId);

    await this.prisma.$transaction((tx) =>
      transicionarPostulacion(tx, postulacion.id, postulacion.estado, "descartada", {
        descartadaEn: new Date(),
      }),
    );

    return this.obtenerVistaCliente(postulacionId);
  }

  /** CL-08: revertir un descarte, solo dentro de la ventana `descarte_reversible_horas`. */
  async revertirDescarte(
    usuarioId: string,
    postulacionId: string,
  ): Promise<PostulacionVistaCliente> {
    const postulacion = await this.buscarPostulacionDelClienteOrThrow(usuarioId, postulacionId);

    if (postulacion.estado !== "descartada") {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Esta postulación no está descartada",
      });
    }

    const descarteReversibleHoras = await this.parametros.getNumero("descarte_reversible_horas");
    const ventanaMs = descarteReversibleHoras * 60 * 60 * 1000;
    if (!postulacion.descartadaEn || Date.now() - postulacion.descartadaEn.getTime() > ventanaMs) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Ya pasó el tiempo para revertir el descarte",
      });
    }

    await this.prisma.$transaction((tx) =>
      transicionarPostulacion(tx, postulacion.id, "descartada", "vista", { descartadaEn: null }),
    );

    return this.obtenerVistaCliente(postulacionId);
  }

  private async buscarPostulacionDelClienteOrThrow(usuarioId: string, postulacionId: string) {
    const postulacion = await this.prisma.postulacion.findUnique({
      where: { id: postulacionId },
      include: { pedido: { select: { clienteId: true } } },
    });
    if (!postulacion || postulacion.pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La postulación no existe" });
    }
    return postulacion;
  }

  private async obtenerVistaCliente(postulacionId: string): Promise<PostulacionVistaCliente> {
    const descarteReversibleHoras = await this.parametros.getNumero("descarte_reversible_horas");
    const postulacion = await this.prisma.postulacion.findUniqueOrThrow({
      where: { id: postulacionId },
      include: INCLUDE_PROFESIONAL_USUARIO,
    });
    return mapearPostulacionAVistaCliente(postulacion as PostulacionConProfesional, {
      ahoraMs: Date.now(),
      descarteReversibleHoras,
    });
  }

  private async buscarPerfilOrThrow(usuarioId: string): Promise<PerfilProfesional> {
    const perfil = await this.prisma.perfilProfesional.findUnique({ where: { usuarioId } });
    if (!perfil) {
      throw new NotFoundException(PERFIL_NO_ARMADO);
    }
    return perfil;
  }

  /**
   * D2 (docs/dominio.md §4/§12): el cliente ya eligio a otro profesional pero
   * esta postulacion sigue viva mientras quede cupo de elegibles. Una sola
   * expresion para crear/listar/retirar (revision de codigo del slice 6:
   * antes cada metodo la escribia a mano, con el riesgo de que se desincronizaran).
   */
  private calcularOtroYaElegido(pedido: {
    cantidadContactos: number;
    estado: EstadoPedido;
  }): boolean {
    return pedido.cantidadContactos > 0 && pedido.estado === "contacto_habilitado";
  }

  /**
   * Regla no negociable #6: se aplica sobre mensaje y disponibilidad juntos,
   * mismo criterio que PedidosService.hayDatosDeContacto sobre
   * descripcion/subcategoria/respuestasGuia.
   */
  private hayDatosDeContacto(mensaje: string, disponibilidad: string | undefined): boolean {
    const textos = [mensaje, disponibilidad];
    return textos.some(
      (texto) => typeof texto === "string" && detectarDatosDeContacto(texto).detectado,
    );
  }

  /** La analitica nunca puede tumbar una accion de negocio ya resuelta (mismo criterio que PedidosService). */
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
}
