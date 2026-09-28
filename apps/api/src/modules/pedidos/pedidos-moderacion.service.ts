import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type {
  MotivoBloqueoPedido,
  PedidoModeracionPagina,
  PedidoModeracionVista,
  ResolverEnRevision,
  ResolverPedidoDenunciado,
} from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  COLA_AVISO_MATCHING,
  type AvisoMatchingJobData,
} from "../../infra/queue/colas.constants.js";
import { EventosService } from "../eventos/eventos.service.js";
import { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import { caducarPostulacionesAbiertas } from "../postulaciones/postulaciones.estados.js";
import { ESTADOS_PEDIDO_ACTIVO, transicionar } from "./pedidos.estados.js";
import {
  mapearPedidoAModeracionVista,
  type DenunciaModeracionInput,
} from "./pedidos-moderacion.vistas.js";

const TAMANIO_PAGINA = 20;

const INCLUDE_MODERACION = {
  cliente: { select: { nombre: true, apellido: true } },
  categoria: true,
  barrio: true,
  fotos: true,
} as const;

/**
 * AD-02 (docs/dominio.md §3/§7, D1/D5): moderacion de pedidos, aparte de
 * PedidosService (CLAUDE.md raiz, anti-sobreingenieria #8: se divide por caso
 * de uso, no por capa tecnica), mismo criterio que ya separa
 * PedidosFeedService/PedidosCierreService. Autocontenido: duplica su propio
 * `registrarEventoSeguro`/`encolarAvisoMatchingSeguro` en vez de depender de
 * PedidosService, mismo patron que el resto del modulo.
 */
@Injectable()
export class PedidosModeracionService {
  private readonly logger = new Logger(PedidosModeracionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly eventos: EventosService,
    private readonly notificaciones: NotificacionesService,
    @InjectQueue(COLA_AVISO_MATCHING)
    private readonly colaAvisoMatching: Queue<AvisoMatchingJobData>,
  ) {}

  /** AD-02, cola 1: pedidos en revision manual (D1), paginados por cursor. */
  async listarEnRevision(cursorId?: string): Promise<PedidoModeracionPagina> {
    const pedidos = await this.prisma.pedido.findMany({
      where: { estado: "en_revision" },
      include: INCLUDE_MODERACION,
      orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      take: TAMANIO_PAGINA + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hayMas = pedidos.length > TAMANIO_PAGINA;
    const pagina = hayMas ? pedidos.slice(0, TAMANIO_PAGINA) : pedidos;

    return {
      items: pagina.map((pedido) => mapearPedidoAModeracionVista(pedido)),
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * AD-02, cola 2: pedidos con al menos una denuncia pendiente. `Denuncia` no
   * tiene FK hacia `Pedido` (objetoId es polimorfico), asi que se resuelve en
   * dos pasadas: primero los ids de pedidos denunciados, despues esos pedidos
   * ordenados igual que la otra cola (por creadoEn del pedido, no de la
   * denuncia, para que el cursor sea estable), y por ultimo sus denuncias
   * pendientes agrupadas en memoria. No es la consulta mas eficiente posible,
   * pero el volumen de un piloto no lo necesita.
   */
  async listarDenunciados(cursorId?: string): Promise<PedidoModeracionPagina> {
    const denunciasPendientes = await this.prisma.denuncia.findMany({
      where: { tipoObjeto: "pedido", estado: "pendiente" },
      select: { objetoId: true },
      distinct: ["objetoId"],
    });
    const idsPedidosDenunciados = denunciasPendientes.map((denuncia) => denuncia.objetoId);
    if (idsPedidosDenunciados.length === 0) {
      return { items: [], cursor: null };
    }

    const pedidos = await this.prisma.pedido.findMany({
      // Solo estados activos (Sugerencia B, code review slice 9): un pedido
      // terminal no tiene ninguna transicion valida hacia "bloqueado", asi
      // que listarlo aca solo para que el boton "Bloquear pedido" del front
      // choque con un 409 no aporta nada.
      where: { id: { in: idsPedidosDenunciados }, estado: { in: [...ESTADOS_PEDIDO_ACTIVO] } },
      include: INCLUDE_MODERACION,
      orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      take: TAMANIO_PAGINA + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hayMas = pedidos.length > TAMANIO_PAGINA;
    const pagina = hayMas ? pedidos.slice(0, TAMANIO_PAGINA) : pedidos;

    const denunciasDeLaPagina =
      pagina.length > 0
        ? await this.prisma.denuncia.findMany({
            where: {
              objetoId: { in: pagina.map((pedido) => pedido.id) },
              tipoObjeto: "pedido",
              estado: "pendiente",
            },
            select: { id: true, objetoId: true, motivo: true, detalle: true, creadoEn: true },
          })
        : [];

    const denunciasPorPedido = new Map<string, DenunciaModeracionInput[]>();
    for (const denuncia of denunciasDeLaPagina) {
      const lista = denunciasPorPedido.get(denuncia.objetoId) ?? [];
      lista.push(denuncia);
      denunciasPorPedido.set(denuncia.objetoId, lista);
    }

    return {
      items: pagina.map((pedido) =>
        mapearPedidoAModeracionVista(pedido, denunciasPorPedido.get(pedido.id) ?? []),
      ),
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * AD-02: resuelve un pedido en_revision (D1). Aprobar publica (mismo
   * calculo de publicadoEn/expiraEn y mismo aviso de matching que
   * PedidosService.crear) y rechaza bloquea con motivo tipificado.
   */
  async resolverEnRevision(
    moderadorId: string,
    pedidoId: string,
    datos: ResolverEnRevision,
  ): Promise<PedidoModeracionVista> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: INCLUDE_MODERACION,
    });
    if (!pedido) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }
    if (pedido.estado !== "en_revision") {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este pedido ya no está en revisión",
      });
    }

    const ahora = new Date();

    if (datos.accion === "aprobar") {
      const vigenciaDias = await this.parametros.getNumero("pedido_vigencia_dias");
      await this.prisma.$transaction((tx) =>
        transicionar(tx, pedidoId, "en_revision", "publicado", {
          // D1 (docs/dominio.md §3/§12): publicadoEn/expiraEn se fijan recien
          // aca, igual que PedidosService.crear, para que la revision no le
          // coma dias de vigencia al cliente.
          publicadoEn: ahora,
          expiraEn: new Date(ahora.getTime() + vigenciaDias * 24 * 60 * 60 * 1000),
        }),
      );
      await this.registrarEventoSeguro({
        tipo: "pedido_publicado",
        categoria: pedido.categoria.slug,
        zona: pedido.barrio.nombre,
        rol: "moderador",
        usuarioId: moderadorId,
        pedidoId,
      });
      await this.encolarAvisoMatchingSeguro(pedidoId);
    } else {
      await this.prisma.$transaction((tx) =>
        transicionar(tx, pedidoId, "en_revision", "bloqueado", {
          // No-null: resolverEnRevisionSchema exige motivo cuando accion="rechazar" (refine).
          motivoModeracion: this.armarMotivo(datos.motivo!, datos.detalle),
        }),
      );
    }

    // docs/dominio.md §9 (D1): "Pedido aprobado o rechazado en revision |
    // Cliente | Push | Al resolver el moderador".
    await this.notificaciones.crear({
      usuarioId: pedido.clienteId,
      tipo: datos.accion === "aprobar" ? "pedido_revision_aprobado" : "pedido_revision_rechazado",
      objetoId: pedidoId,
    });

    const actualizado = await this.prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: INCLUDE_MODERACION,
    });
    return mapearPedidoAModeracionVista(actualizado);
  }

  /**
   * AD-02: resuelve la cola de denunciados. Descartar solo cierra las
   * denuncias; bloquear ademas saca el pedido de circulacion (D5: puede estar
   * en cualquier estado activo, `transicionar()` valida el origen real).
   */
  async resolverDenuncia(
    moderadorId: string,
    pedidoId: string,
    datos: ResolverPedidoDenunciado,
  ): Promise<PedidoModeracionVista> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: INCLUDE_MODERACION,
    });
    if (!pedido) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    const denunciasPendientes = await this.prisma.denuncia.findMany({
      where: { tipoObjeto: "pedido", objetoId: pedidoId, estado: "pendiente" },
      select: { id: true },
    });
    if (denunciasPendientes.length === 0) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "Este pedido no tiene denuncias pendientes",
      });
    }
    const idsDenuncias = denunciasPendientes.map((denuncia) => denuncia.id);
    const ahora = new Date();

    if (datos.accion === "bloquear") {
      await this.prisma.$transaction(async (tx) => {
        // D5 (docs/dominio.md §3/§12): el pedido puede estar en cualquier
        // estado activo cuando lo denuncian (publicado, con_postulaciones,
        // contacto_habilitado); transicionar() valida el origen real contra
        // la tabla de transiciones y tira ConflictException si ya esta en un
        // estado terminal, que se deja propagar tal cual.
        await transicionar(tx, pedidoId, pedido.estado, "bloqueado", {
          // No-null: resolverPedidoDenunciadoSchema exige motivo cuando accion="bloquear" (refine).
          motivoModeracion: this.armarMotivo(datos.motivo!, datos.detalle),
        });
        // D2/D3 (docs/dominio.md §4, tabla): el pedido bloqueado deja de
        // aceptar postulaciones abiertas, que caducan en la misma transaccion.
        await caducarPostulacionesAbiertas(tx, pedidoId);
        await tx.denuncia.updateMany({
          where: { id: { in: idsDenuncias } },
          data: { estado: "resuelta", resueltaEn: ahora },
        });
      });

      // D5: "se avisa a las dos partes", en cualquier estado activo incluido
      // contacto_habilitado. Al cliente via CO-05/`notificacion`; a cada
      // profesional que ya estaba elegido (si el pedido llego a tener algun
      // Contacto) tambien, buscando los contactos despues de la transaccion.
      await this.notificaciones.crear({
        usuarioId: pedido.clienteId,
        tipo: "pedido_bloqueado",
        objetoId: pedidoId,
      });
      await this.avisarElegidosPedidoBloqueado(pedidoId);
    } else {
      await this.prisma.denuncia.updateMany({
        where: { id: { in: idsDenuncias } },
        data: { estado: "descartada", resueltaEn: ahora },
      });
    }

    const actualizado = await this.prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: INCLUDE_MODERACION,
    });
    return mapearPedidoAModeracionVista(actualizado);
  }

  /**
   * D5: avisa a cada profesional que ya estaba elegido en este pedido (si
   * llego a tener algun Contacto) de que el pedido se bloqueo. Se llama
   * siempre despues de la transaccion que bloquea el pedido, mismo criterio
   * que el resto de las notificaciones de este service.
   */
  private async avisarElegidosPedidoBloqueado(pedidoId: string): Promise<void> {
    const contactos = await this.prisma.contacto.findMany({
      where: { pedidoId },
      select: { postulacion: { select: { profesional: { select: { usuarioId: true } } } } },
    });
    if (contactos.length === 0) return;

    await this.notificaciones.crearVarias(
      contactos.map((contacto) => ({
        usuarioId: contacto.postulacion.profesional.usuarioId,
        tipo: "pedido_bloqueado",
        objetoId: pedidoId,
      })),
    );
  }

  private armarMotivo(motivo: MotivoBloqueoPedido, detalle: string | undefined): string {
    return detalle ? `${motivo}: ${detalle}` : motivo;
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

  /** Mismo criterio que registrarEventoSeguro: el pedido ya se aprobo, no encolar el aviso no puede tumbar la respuesta. */
  private async encolarAvisoMatchingSeguro(pedidoId: string): Promise<void> {
    try {
      await this.colaAvisoMatching.add("aviso-matching", { pedidoId });
    } catch (error) {
      this.logger.warn(`No se pudo encolar el aviso de matching: ${String(error)}`);
    }
  }
}
