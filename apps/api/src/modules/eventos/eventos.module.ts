import { Module } from "@nestjs/common";
import { EventosController } from "./eventos.controller.js";
import { EventosService } from "./eventos.service.js";

@Module({
  controllers: [EventosController],
  providers: [EventosService],
  exports: [EventosService],
})
export class EventosModule {}
