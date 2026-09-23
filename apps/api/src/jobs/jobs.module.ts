import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { COLA_AVISO_MATCHING, OPCIONES_JOB_POR_DEFECTO } from "../infra/queue/colas.constants.js";
import { PedidosModule } from "../modules/pedidos/pedidos.module.js";
import { NotificacionesModule } from "../modules/notificaciones/notificaciones.module.js";
import { AvisoMatchingProcessor } from "./aviso-matching.processor.js";

@Module({
  imports: [
    BullModule.registerQueue({
      name: COLA_AVISO_MATCHING,
      defaultJobOptions: OPCIONES_JOB_POR_DEFECTO,
    }),
    PedidosModule,
    NotificacionesModule,
  ],
  providers: [AvisoMatchingProcessor],
})
export class JobsModule {}
