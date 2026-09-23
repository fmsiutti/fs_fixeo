import { Injectable, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { COLA_AVISO_MATCHING, type AvisoMatchingJobData } from "../infra/queue/colas.constants.js";
import { PrismaService } from "../infra/prisma/prisma.service.js";
import { MatchingService } from "../modules/pedidos/pedidos-matching.service.js";
import { NotificacionesService } from "../modules/notificaciones/notificaciones.service.js";

/**
 * Aviso inicial a los profesionales coincidentes (docs/dominio.md §6,
 * apps/api/CLAUDE.md "Jobs"). Idempotente: si el pedido ya no esta
 * `publicado` cuando se procesa (se cancelo, bloqueo o paso de estado entre
 * que se encolo y esto corrio) no hace nada, y `NotificacionesService.crear`
 * ya deduplica por (usuarioId, tipo, objetoId).
 */
@Injectable()
@Processor(COLA_AVISO_MATCHING)
export class AvisoMatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(AvisoMatchingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly notificaciones: NotificacionesService,
  ) {
    super();
  }

  async process(job: Job<AvisoMatchingJobData>): Promise<void> {
    const { pedidoId } = job.data;

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { estado: true },
    });
    if (!pedido || pedido.estado !== "publicado") return;

    const usuarioIds = await this.matching.buscarCoincidentes(pedidoId);
    // Un solo round-trip en vez de un `crear()` por usuario en un loop
    // (revision de codigo del slice 5): notificar a ~30 profesionales no
    // necesita 30 idas y vueltas a la base.
    await this.notificaciones.crearVarias(
      usuarioIds.map((usuarioId) => ({
        usuarioId,
        tipo: "pedido_nuevo_coincide",
        objetoId: pedidoId,
      })),
    );

    this.logger.debug(`Aviso de matching procesado para el pedido ${pedidoId}`);
  }
}
