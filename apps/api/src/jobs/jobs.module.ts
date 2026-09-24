import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import {
  COLA_AVISO_MATCHING,
  COLA_BARRIDOS_PEDIDOS,
  OPCIONES_JOB_POR_DEFECTO,
} from "../infra/queue/colas.constants.js";
import { PedidosModule } from "../modules/pedidos/pedidos.module.js";
import { NotificacionesModule } from "../modules/notificaciones/notificaciones.module.js";
import { ParametrosModule } from "../modules/parametros/parametros.module.js";
import { AvisoMatchingProcessor } from "./aviso-matching.processor.js";
import { BarridosPedidosProcessor } from "./barridos-pedidos.processor.js";
import { BarridosPedidosScheduler } from "./barridos-pedidos.scheduler.js";

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: COLA_AVISO_MATCHING,
        defaultJobOptions: OPCIONES_JOB_POR_DEFECTO,
      },
      {
        name: COLA_BARRIDOS_PEDIDOS,
        defaultJobOptions: OPCIONES_JOB_POR_DEFECTO,
      },
    ),
    PedidosModule,
    NotificacionesModule,
    ParametrosModule,
  ],
  providers: [AvisoMatchingProcessor, BarridosPedidosProcessor, BarridosPedidosScheduler],
})
export class JobsModule {}
