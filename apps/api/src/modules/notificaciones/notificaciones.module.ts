import { Module } from "@nestjs/common";
import { WebPushModule } from "../../infra/webpush/web-push.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { NotificacionesController } from "./notificaciones.controller.js";
import { NotificacionesPublicoController } from "./notificaciones-publico.controller.js";
import { NotificacionesService } from "./notificaciones.service.js";

@Module({
  imports: [AuthModule, WebPushModule],
  controllers: [NotificacionesController, NotificacionesPublicoController],
  providers: [NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
