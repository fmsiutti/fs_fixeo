import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EventosModule } from "../eventos/eventos.module.js";
import { NotificacionesModule } from "../notificaciones/notificaciones.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { PostulacionesController } from "./postulaciones.controller.js";
import { PostulacionesService } from "./postulaciones.service.js";

@Module({
  imports: [AuthModule, ParametrosModule, EventosModule, NotificacionesModule],
  controllers: [PostulacionesController],
  providers: [PostulacionesService],
  // PedidosModule lo necesita para CL-08 (GET /pedidos/:id/postulaciones,
  // PATCH descartar/revertir-descarte) desde PedidosController.
  exports: [PostulacionesService],
})
export class PostulacionesModule {}
