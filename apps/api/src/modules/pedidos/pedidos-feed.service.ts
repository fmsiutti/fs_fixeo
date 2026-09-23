import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { PedidoFeedFiltros, PedidoFeedPagina, PedidoVistaProfesional } from "@fixeo/shared";
import { Prisma } from "../../generated/prisma/client.js";
import type {
  OficioProfesional,
  PerfilProfesional,
  ZonaCobertura,
} from "../../generated/prisma/client.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { EventosService } from "../eventos/eventos.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import {
  mapearPedidoAFeedItemVista,
  mapearPedidoAVistaProfesional,
  type PedidoDetalleFeedConRelaciones,
  type PedidoFeedItemConRelaciones,
} from "./pedidos.feed.vistas.js";

const TAMANIO_PAGINA_FEED = 20;

const INCLUDE_FEED_ITEM = {
  categoria: { select: { nombre: true, slug: true } },
  barrio: { select: { id: true, nombre: true } },
  _count: { select: { fotos: true } },
} as const;

const INCLUDE_DETALLE_FEED = {
  categoria: true,
  barrio: true,
  fotos: true,
  cliente: { select: { nombre: true } },
} as const;

type PerfilConCobertura = PerfilProfesional & {
  oficios: OficioProfesional[];
  zonaCobertura: ZonaCobertura;
};

/**
 * Feed (PR-02) y detalle (PR-03) del profesional (docs/dominio.md §6/§7).
 * Aparte de PedidosService (que es el caso de uso del cliente dueno del
 * pedido) porque son casos de uso bien distintos, con su propia nocion de
 * "visible" (CLAUDE.md raiz: un service que crece se divide por caso de uso).
 */
@Injectable()
export class PedidosFeedService {
  private readonly logger = new Logger(PedidosFeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly eventos: EventosService,
  ) {}

  async listarFeed(usuarioId: string, filtros: PedidoFeedFiltros): Promise<PedidoFeedPagina> {
    const perfil = await this.buscarPerfilConCobertura(usuarioId);
    if (!perfil) {
      return { items: [], cursor: null, verificacionAprobada: false };
    }

    const categoriaIds = this.resolverCategoriaIds(perfil, filtros.categoriaId);
    const [seleccionablesMax, postulacionesMax] = await Promise.all([
      this.parametros.getNumero("seleccionables_max_por_pedido"),
      this.parametros.getNumero("postulaciones_max_por_pedido"),
    ]);

    const uiFiltrosWhere: Prisma.PedidoWhereInput = {
      // Una cuenta con los dos roles (docs/dominio.md §2) no se ve a si misma
      // en su propio feed profesional (revision de codigo del slice 5).
      clienteId: { not: usuarioId },
      ...(filtros.urgencia ? { urgencia: filtros.urgencia } : {}),
      ...(filtros.sinPostulaciones ? { cantidadPostulaciones: 0 } : {}),
      ...(filtros.conFotos ? { fotos: { some: {} } } : {}),
    };

    const { where, distanciaPorId } = await this.armarWhereDeCobertura(
      perfil.zonaCobertura,
      categoriaIds,
      seleccionablesMax,
      postulacionesMax,
      usuarioId,
      filtros.distanciaMaxKm,
      uiFiltrosWhere,
    );

    const pedidos = await this.prisma.pedido.findMany({
      where,
      include: INCLUDE_FEED_ITEM,
      // docs/dominio.md §6: "antiguedad descendente con los urgentes arriba".
      // El enum Urgencia se declara emergencia/esta_semana/sin_apuro en ese
      // orden, asi que Postgres ya ordena "asc" con las emergencias primero.
      orderBy: [{ urgencia: "asc" }, { publicadoEn: "desc" }, { id: "desc" }],
      take: TAMANIO_PAGINA_FEED + 1,
      ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    });

    const hayMas = pedidos.length > TAMANIO_PAGINA_FEED;
    const pagina = hayMas ? pedidos.slice(0, TAMANIO_PAGINA_FEED) : pedidos;

    const items = pagina.map((pedido: PedidoFeedItemConRelaciones) =>
      mapearPedidoAFeedItemVista(pedido, distanciaPorId?.get(pedido.id) ?? null),
    );

    return {
      items,
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
      verificacionAprobada: perfil.estadoVerificacion === "aprobada",
    };
  }

  async obtenerDelFeed(usuarioId: string, pedidoId: string): Promise<PedidoVistaProfesional> {
    const perfil = await this.buscarPerfilConCobertura(usuarioId);
    if (!perfil) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: INCLUDE_DETALLE_FEED,
    });
    if (!pedido) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    // Una cuenta con los dos roles no puede "postularse" a su propio pedido
    // (docs/dominio.md §2 permite los dos roles; revision de codigo del
    // slice 5): se trata igual que un pedido que este profesional no deberia
    // ver en absoluto.
    if (pedido.clienteId === usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    const categoriaIds = perfil.oficios.map((oficio) => oficio.categoriaId);
    if (!categoriaIds.includes(pedido.categoriaId)) {
      // Ningun motivo de privacidad para ocultarlo (a diferencia de
      // obtenerPropio), pero tampoco tiene sentido devolver un pedido que
      // este profesional no deberia ver.
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    const { cubre, distanciaKm } = await this.calcularCobertura(perfil.zonaCobertura, pedido);
    if (!cubre) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    const [seleccionablesMax, postulacionesMax] = await Promise.all([
      this.parametros.getNumero("seleccionables_max_por_pedido"),
      this.parametros.getNumero("postulaciones_max_por_pedido"),
    ]);
    const visibleAbierto = pedido.estado === "publicado" || pedido.estado === "con_postulaciones";
    // docs/dominio.md §6: "sigue en el feed mientras quede cupo de elegibles
    // Y de postulaciones" (revision de codigo del slice 5: antes solo se
    // miraba el cupo de elegibles). Sale si falta cualquiera de los dos.
    const tieneCupoLibre =
      pedido.cantidadContactos < seleccionablesMax &&
      pedido.cantidadPostulaciones < postulacionesMax;
    const visibleConCupo = pedido.estado === "contacto_habilitado" && tieneCupoLibre;
    if (!visibleAbierto && !visibleConCupo) {
      if (pedido.estado === "contacto_habilitado") {
        // Estado correcto pero sin cupo de ninguno de los dos: es
        // efectivamente "el cliente ya completo su eleccion".
        throw new ConflictException({
          codigo: "conflicto",
          mensaje: "El cliente ya completó su elección",
        });
      }
      // Cualquier otro estado no visible (cancelado, cerrado, expirado,
      // bloqueado, en_revision, borrador) no tiene nada que ver con "ya
      // eligio": el mensaje de arriba seria falso (revision de codigo del
      // slice 5, D2 prohibe mensajes falsos de este tipo).
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "Este pedido ya no existe o no está disponible",
      });
    }

    await this.prisma.pedido.update({
      where: { id: pedidoId },
      data: { vistas: { increment: 1 } },
    });
    await this.registrarEventoSeguro({
      tipo: "pedido_visto_por_profesional",
      categoria: pedido.categoria.slug,
      zona: pedido.barrio.nombre,
      rol: "profesional",
      usuarioId,
      pedidoId,
    });

    return mapearPedidoAVistaProfesional(pedido as PedidoDetalleFeedConRelaciones, {
      distanciaKm,
      postulacionesCupoLleno: pedido.cantidadPostulaciones >= postulacionesMax,
      yaEligioAlguien: pedido.cantidadContactos > 0,
      seleccionablesLibres: seleccionablesMax - pedido.cantidadContactos,
      verificacionAprobada: perfil.estadoVerificacion === "aprobada",
    });
  }

  /** Perfil con oficios y zona, o null si todavia no armo lo necesario para entrar al feed. */
  private async buscarPerfilConCobertura(usuarioId: string): Promise<PerfilConCobertura | null> {
    const perfil = await this.prisma.perfilProfesional.findUnique({
      where: { usuarioId },
      include: { oficios: true, zonaCobertura: true },
    });
    if (!perfil || perfil.oficios.length === 0 || !perfil.zonaCobertura) return null;

    const zona = perfil.zonaCobertura;
    if (
      zona.tipo === "radio" &&
      (zona.centroLat === null || zona.centroLng === null || zona.radioKm === null)
    ) {
      return null;
    }
    return perfil as PerfilConCobertura;
  }

  /** `categoriaId` en la query solo sirve para acotar a uno de los propios oficios (PR-02: filtro "oficio"). */
  private resolverCategoriaIds(perfil: PerfilConCobertura, categoriaIdFiltro?: string): string[] {
    const categoriaIdsPropios = perfil.oficios.map((oficio) => oficio.categoriaId);
    if (!categoriaIdFiltro) return categoriaIdsPropios;
    if (!categoriaIdsPropios.includes(categoriaIdFiltro)) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "Esa categoría no es uno de tus oficios",
      });
    }
    return [categoriaIdFiltro];
  }

  /**
   * Zona "barrios": filtro Prisma normal, sin distancia. Zona "radio": una
   * consulta $queryRaw aparte que trae ids + distancia dentro del radio de
   * ESTA zona (a diferencia del matching del job, aca el centro es fijo y no
   * hace falta el factor de emergencia: ese factor decide a quien avisar, no
   * que ve el profesional en su propio feed).
   */
  private async armarWhereDeCobertura(
    zona: ZonaCobertura,
    categoriaIds: string[],
    seleccionablesMax: number,
    postulacionesMax: number,
    usuarioId: string,
    distanciaMaxKm: number | undefined,
    uiFiltrosWhere: Prisma.PedidoWhereInput,
  ): Promise<{ where: Prisma.PedidoWhereInput; distanciaPorId: Map<string, number> | null }> {
    // docs/dominio.md §6: sigue en el feed mientras quede cupo de elegibles Y
    // de postulaciones (revision de codigo del slice 5: antes solo miraba el
    // cupo de elegibles).
    const estadoWhere: Prisma.PedidoWhereInput = {
      OR: [
        { estado: { in: ["publicado", "con_postulaciones"] } },
        {
          estado: "contacto_habilitado",
          cantidadContactos: { lt: seleccionablesMax },
          cantidadPostulaciones: { lt: postulacionesMax },
        },
      ],
    };

    if (zona.tipo === "barrios") {
      return {
        where: {
          categoriaId: { in: categoriaIds },
          barrioId: { in: zona.barrioIds },
          ...estadoWhere,
          ...uiFiltrosWhere,
        },
        distanciaPorId: null,
      };
    }

    const candidatos = await this.prisma.$queryRaw<
      { id: string; distanciaKm: number }[]
    >(Prisma.sql`
      SELECT
        p.id AS id,
        ST_Distance(
          ST_MakePoint(${zona.centroLng}, ${zona.centroLat})::geography,
          ST_MakePoint(p.lng, p.lat)::geography
        ) / 1000 AS "distanciaKm"
      FROM pedido p
      WHERE p.categoria_id IN (${Prisma.join(categoriaIds)})
        AND p.cliente_id <> ${usuarioId}
        AND (
          p.estado IN ('publicado', 'con_postulaciones')
          OR (
            p.estado = 'contacto_habilitado'
            AND p.cantidad_contactos < ${seleccionablesMax}
            AND p.cantidad_postulaciones < ${postulacionesMax}
          )
        )
        AND ST_DWithin(
          ST_MakePoint(${zona.centroLng}, ${zona.centroLat})::geography,
          ST_MakePoint(p.lng, p.lat)::geography,
          ${zona.radioKm} * 1000
        )
      -- Tope de seguridad, no una paginacion real (esa sigue pasando en el
      -- findMany de Prisma con cursor mas abajo): sin esto, una zona de radio
      -- muy amplia podria armar un id-in con miles de parametros. 500 alcanza
      -- de sobra para el volumen de un piloto; si el volumen crece, esto
      -- necesitaria un indice GiST dedicado en vez de este LIMIT (mejora
      -- futura, no justificada todavia).
      LIMIT 500
    `);

    const distanciaPorId = new Map(
      candidatos.map((candidato) => [candidato.id, candidato.distanciaKm]),
    );
    const idsPermitidos = candidatos
      .filter(
        (candidato) => distanciaMaxKm === undefined || candidato.distanciaKm <= distanciaMaxKm,
      )
      .map((candidato) => candidato.id);

    return {
      where: { id: { in: idsPermitidos }, ...uiFiltrosWhere },
      distanciaPorId,
    };
  }

  /** Igual criterio que en el feed, pero para un solo pedido (PR-03). */
  private async calcularCobertura(
    zona: ZonaCobertura,
    pedido: { barrioId: string; lat: number; lng: number },
  ): Promise<{ cubre: boolean; distanciaKm: number | null }> {
    if (zona.tipo === "barrios") {
      return { cubre: zona.barrioIds.includes(pedido.barrioId), distanciaKm: null };
    }

    const [resultado] = await this.prisma.$queryRaw<{ distanciaKm: number; dentro: boolean }[]>(
      Prisma.sql`
        SELECT
          ST_Distance(
            ST_MakePoint(${zona.centroLng}, ${zona.centroLat})::geography,
            ST_MakePoint(${pedido.lng}, ${pedido.lat})::geography
          ) / 1000 AS "distanciaKm",
          ST_DWithin(
            ST_MakePoint(${zona.centroLng}, ${zona.centroLat})::geography,
            ST_MakePoint(${pedido.lng}, ${pedido.lat})::geography,
            ${zona.radioKm} * 1000
          ) AS "dentro"
      `,
    );
    return { cubre: resultado?.dentro ?? false, distanciaKm: resultado?.distanciaKm ?? null };
  }

  /** Mismo criterio que PedidosService: la analitica nunca tumba una accion de negocio ya resuelta. */
  private async registrarEventoSeguro(
    datos: Parameters<EventosService["registrar"]>[0],
  ): Promise<void> {
    try {
      await this.eventos.registrar(datos);
    } catch (error) {
      this.logger.warn(`No se pudo registrar el evento "${datos.tipo}": ${String(error)}`);
    }
  }
}
