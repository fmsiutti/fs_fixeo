import { Module } from "@nestjs/common";
import { NotificacionesService } from "./notificaciones.service.js";

@Module({
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
