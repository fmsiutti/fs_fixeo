import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AlmacenamientoModule } from "../../infra/almacenamiento/almacenamiento.module.js";
import {
  COLA_AVISO_MATCHING,
  OPCIONES_JOB_POR_DEFECTO,
} from "../../infra/queue/colas.constants.js";
import { AuthModule } from "../auth/auth.module.js";
import { EventosModule } from "../eventos/eventos.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { PedidosController } from "./pedidos.controller.js";
import { PedidosFeedService } from "./pedidos-feed.service.js";
import { MatchingService } from "./pedidos-matching.service.js";
import { PedidosService } from "./pedidos.service.js";

@Module({
  imports: [
    AuthModule,
    ParametrosModule,
    AlmacenamientoModule,
    EventosModule,
    BullModule.registerQueue({
      name: COLA_AVISO_MATCHING,
      defaultJobOptions: OPCIONES_JOB_POR_DEFECTO,
    }),
  ],
  controllers: [PedidosController],
  providers: [PedidosService, PedidosFeedService, MatchingService],
  // MatchingService lo usa AvisoMatchingProcessor (JobsModule).
  exports: [MatchingService],
})
export class PedidosModule {}
