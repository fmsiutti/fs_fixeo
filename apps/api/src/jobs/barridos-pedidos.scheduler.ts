import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  COLA_BARRIDOS_PEDIDOS,
  NOMBRES_BARRIDO_PEDIDOS,
  PATRON_BARRIDOS_PEDIDOS,
} from "../infra/queue/colas.constants.js";

/**
 * Registra los 6 barridos periodicos como Job Schedulers de BullMQ al
 * arrancar la app (`Queue.add({ repeat })` esta deprecado en la version de
 * bullmq instalada: `repeat` ya no es una opcion valida de `Queue.add`, hay
 * que usar `upsertJobScheduler`). `jobSchedulerId` fijo, uno por barrido:
 * `upsertJobScheduler` es un upsert de verdad, asi que un restart del
 * proceso no acumula schedulers duplicados, solo confirma que siga
 * configurado igual.
 */
@Injectable()
export class BarridosPedidosScheduler implements OnModuleInit {
  private readonly logger = new Logger(BarridosPedidosScheduler.name);

  constructor(@InjectQueue(COLA_BARRIDOS_PEDIDOS) private readonly cola: Queue) {}

  async onModuleInit(): Promise<void> {
    for (const nombre of NOMBRES_BARRIDO_PEDIDOS) {
      await this.cola.upsertJobScheduler(
        `barrido-${nombre}`,
        { pattern: PATRON_BARRIDOS_PEDIDOS },
        { name: nombre, data: {} },
      );
    }
    this.logger.log(`${NOMBRES_BARRIDO_PEDIDOS.length} barridos periodicos registrados`);
  }
}
