import { Injectable, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import {
  COLA_BARRIDOS_PEDIDOS,
  type NombreBarridoPedidos,
} from "../infra/queue/colas.constants.js";
import { PrismaService } from "../infra/prisma/prisma.service.js";
import { ParametrosService } from "../modules/parametros/parametros.service.js";
import { NotificacionesService } from "../modules/notificaciones/notificaciones.service.js";
import { EventosService } from "../modules/eventos/eventos.service.js";
import { transicionar as transicionarPedido } from "../modules/pedidos/pedidos.estados.js";
import { caducarPostulacionesAbiertas } from "../modules/postulaciones/postulaciones.estados.js";

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

// Tope por corrida de cada barrido (apps/api/CLAUDE.md, "listados paginados...
// nunca colecciones sin limite"). El barrido corre cada 15 minutos: lo que no
// entra en un lote se procesa en la corrida siguiente, no hace falta traer
// toda la tabla de una.
const LOTE_BARRIDO = 200;

/**
 * Los 6 barridos periodicos de cierre y reseñas (docs/dominio.md §9,
 * apps/api/CLAUDE.md "Jobs"). Todos leen la base (nunca dependen de que un
 * job puntual se haya encolado antes) y son idempotentes: los que solo avisan
 * usan `NotificacionesService.crear`/`crearVarias`, que dedupe por
 * (usuarioId, tipo, objetoId); los que cambian estado usan `transicionar()`,
 * cuyo `updateMany` condicional al estado de origen ya es a prueba de
 * reprocesos.
 */
@Injectable()
@Processor(COLA_BARRIDOS_PEDIDOS)
export class BarridosPedidosProcessor extends WorkerHost {
  private readonly logger = new Logger(BarridosPedidosProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly notificaciones: NotificacionesService,
    private readonly eventos: EventosService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const nombre = job.name as NombreBarridoPedidos;
    switch (nombre) {
      case "expiracion":
        return this.barrerExpiracion();
      case "aviso-expiracion":
        return this.barrerAvisoExpiracion();
      case "aviso-sin-postulaciones":
        return this.barrerAvisoSinPostulaciones();
      case "consulta-contacto":
        return this.barrerConsultaContacto();
      case "consulta-desenlace":
        return this.barrerConsultaDesenlace();
      case "cierre-automatico":
        return this.barrerCierreAutomatico();
      default:
        this.logger.warn(`Barrido desconocido: "${String(nombre)}"`);
    }
  }

  /**
   * docs/dominio.md §3: 7 dias desde publicado_en sin ninguna seleccion.
   * Las postulaciones abiertas pasan a `caducada` junto con el pedido; sin
   * aviso a los profesionales (la tabla de §4 solo avisa "caducada" en
   * `cancelado`, no en `expirado`).
   */
  private async barrerExpiracion(): Promise<void> {
    const ahora = new Date();
    const pedidos = await this.prisma.pedido.findMany({
      where: { estado: { in: ["publicado", "con_postulaciones"] }, expiraEn: { lte: ahora } },
      select: { id: true, estado: true },
      take: LOTE_BARRIDO,
    });

    let procesados = 0;
    for (const pedido of pedidos) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await transicionarPedido(tx, pedido.id, pedido.estado, "expirado");
          await caducarPostulacionesAbiertas(tx, pedido.id);
        });
        procesados++;
      } catch (error) {
        this.logger.warn(`No se pudo expirar un pedido: ${String(error)}`);
      }
    }
    this.logger.log(`Barrido de expiracion: ${procesados}/${pedidos.length} pedidos`);
  }

  /** docs/dominio.md §9: "Pedido por expirar | Cliente | Push | Dia 6". */
  private async barrerAvisoExpiracion(): Promise<void> {
    const [vigenciaDias, avisoDia] = await Promise.all([
      this.parametros.getNumero("pedido_vigencia_dias"),
      this.parametros.getNumero("aviso_expiracion_dia"),
    ]);
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + (vigenciaDias - avisoDia) * DIA_MS);

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        estado: { in: ["publicado", "con_postulaciones"] },
        expiraEn: { gt: ahora, lte: limite },
      },
      select: { id: true, clienteId: true },
      take: LOTE_BARRIDO,
    });

    await this.notificaciones.crearVarias(
      pedidos.map((pedido) => ({
        usuarioId: pedido.clienteId,
        tipo: "pedido_por_expirar",
        objetoId: pedido.id,
      })),
    );
    this.logger.log(`Barrido de aviso de expiracion: ${pedidos.length} pedidos`);
  }

  /** docs/dominio.md §9: "Sin postulaciones | Cliente | Push | 12 h". */
  private async barrerAvisoSinPostulaciones(): Promise<void> {
    const horas = await this.parametros.getNumero("aviso_sin_postulaciones_horas");
    const limite = new Date(Date.now() - horas * HORA_MS);

    // "publicado" (no "con_postulaciones") ya implica cantidadPostulaciones
    // === 0: la primera postulacion transiciona el pedido a con_postulaciones.
    const pedidos = await this.prisma.pedido.findMany({
      where: { estado: "publicado", publicadoEn: { lte: limite } },
      select: { id: true, clienteId: true },
      take: LOTE_BARRIDO,
    });

    await this.notificaciones.crearVarias(
      pedidos.map((pedido) => ({
        usuarioId: pedido.clienteId,
        tipo: "pedido_sin_postulaciones",
        objetoId: pedido.id,
      })),
    );
    this.logger.log(`Barrido de aviso sin postulaciones: ${pedidos.length} pedidos`);
  }

  /**
   * docs/dominio.md §9: "¿Pudiste contactarte? | Cliente | Push | 48 h desde
   * el primer contacto". `objetoId` es el Contacto (no el pedido): un pedido
   * con 2 o 3 elegidos tiene una pregunta por contacto, cada una con su
   * propia deduplicacion.
   */
  private async barrerConsultaContacto(): Promise<void> {
    const horas = await this.parametros.getNumero("consulta_contacto_horas");
    const limite = new Date(Date.now() - horas * HORA_MS);

    const contactos = await this.prisma.contacto.findMany({
      where: { habilitadoEn: { lte: limite }, pedido: { estado: "contacto_habilitado" } },
      select: { id: true, pedido: { select: { clienteId: true } } },
      take: LOTE_BARRIDO,
    });

    await this.notificaciones.crearVarias(
      contactos.map((contacto) => ({
        usuarioId: contacto.pedido.clienteId,
        tipo: "consulta_contacto",
        objetoId: contacto.id,
      })),
    );
    this.logger.log(`Barrido de consulta de contacto: ${contactos.length} contactos`);
  }

  /**
   * docs/dominio.md §9/§12 D4: "¿Como termino? | Cliente | Push | Dia 7 desde
   * el primer contacto, y una sola vez mas si postergo". Tipos de
   * notificacion distintos segun `desenlacePostergado`: si fueran el mismo
   * tipo, el dedupe de Notificacion (usuarioId, tipo, objetoId) bloquearia la
   * segunda pregunta tras la postergacion.
   *
   * `cierreAutomaticoEn` corre dos "relojes" distintos segun de donde viene:
   * `cierre_automatico_dias` desde el primer contacto si nunca postergo,
   * `postergacion_desenlace_dias` desde el momento de postergar si ya lo
   * hizo (D4). La ventana de consulta es siempre `consulta_desenlace_dias`
   * antes de ese limite — mismo criterio relativo que ya usa
   * `barrerAvisoExpiracion` con `vigenciaDias - avisoDia`, para que la
   * cuenta siga dando bien si alguno de los 3 parametros cambia en
   * `parametro_negocio` sin que cambien los otros dos.
   */
  private async barrerConsultaDesenlace(): Promise<void> {
    const [cierreAutomaticoDias, postergacionDias, consultaDias] = await Promise.all([
      this.parametros.getNumero("cierre_automatico_dias"),
      this.parametros.getNumero("postergacion_desenlace_dias"),
      this.parametros.getNumero("consulta_desenlace_dias"),
    ]);
    const ahora = new Date();
    const limiteNormal = new Date(ahora.getTime() + (cierreAutomaticoDias - consultaDias) * DIA_MS);
    const limitePostergado = new Date(ahora.getTime() + (postergacionDias - consultaDias) * DIA_MS);

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        estado: "contacto_habilitado",
        OR: [
          { desenlacePostergado: false, cierreAutomaticoEn: { gt: ahora, lte: limiteNormal } },
          { desenlacePostergado: true, cierreAutomaticoEn: { gt: ahora, lte: limitePostergado } },
        ],
      },
      select: { id: true, clienteId: true, desenlacePostergado: true },
      take: LOTE_BARRIDO,
    });

    await this.notificaciones.crearVarias(
      pedidos.map((pedido) => ({
        usuarioId: pedido.clienteId,
        tipo: pedido.desenlacePostergado ? "consulta_desenlace_postergada" : "consulta_desenlace",
        objetoId: pedido.id,
      })),
    );
    this.logger.log(`Barrido de consulta de desenlace: ${pedidos.length} pedidos`);
  }

  /**
   * docs/dominio.md §12 D4: "si no hay respuesta, cierra sin resenia". Cierra
   * directo a `cerrado` sin setear `desenlace` (queda null: nadie declaro
   * nada) y sin invitacion a reseñar. Mismo efecto que cualquier otro cierre
   * sobre las postulaciones abiertas (§4, tabla D2: caducan) y sobre la
   * analitica (§10: `pedido_cerrado` se registra en el mismo cambio que la
   * accion, tambien cuando la "accion" la dispara un job y no el cliente).
   */
  private async barrerCierreAutomatico(): Promise<void> {
    const ahora = new Date();
    const pedidos = await this.prisma.pedido.findMany({
      where: { estado: "contacto_habilitado", cierreAutomaticoEn: { lte: ahora } },
      select: {
        id: true,
        clienteId: true,
        categoria: { select: { slug: true } },
        barrio: { select: { nombre: true } },
      },
      take: LOTE_BARRIDO,
    });

    let procesados = 0;
    for (const pedido of pedidos) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await transicionarPedido(tx, pedido.id, "contacto_habilitado", "cerrado");
          await caducarPostulacionesAbiertas(tx, pedido.id);
        });
        procesados++;
        await this.registrarEventoSeguro({
          tipo: "pedido_cerrado",
          categoria: pedido.categoria.slug,
          zona: pedido.barrio.nombre,
          rol: "cliente",
          usuarioId: pedido.clienteId,
          pedidoId: pedido.id,
        });
      } catch (error) {
        this.logger.warn(`No se pudo cerrar automaticamente un pedido: ${String(error)}`);
      }
    }
    this.logger.log(`Barrido de cierre automatico: ${procesados}/${pedidos.length} pedidos`);
  }

  /** La analitica nunca puede tumbar un barrido ya resuelto (mismo criterio que los services de negocio). */
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
