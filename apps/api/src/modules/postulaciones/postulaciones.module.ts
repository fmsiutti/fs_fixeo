import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ContactosModule } from "../contactos/contactos.module.js";
import { EventosModule } from "../eventos/eventos.module.js";
import { NotificacionesModule } from "../notificaciones/notificaciones.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { PostulacionesController } from "./postulaciones.controller.js";
import { PostulacionesService } from "./postulaciones.service.js";

@Module({
  // ContactosModule: PostulacionesController (CL-08/PR-06) inyecta
  // ContactosService directo para seleccionar/no-puedo-tomarlo/elegido.
  imports: [AuthModule, ParametrosModule, EventosModule, NotificacionesModule, ContactosModule],
  controllers: [PostulacionesController],
  providers: [PostulacionesService],
  // PedidosModule lo necesita para CL-08 (GET /pedidos/:id/postulaciones,
  // PATCH descartar/revertir-descarte) desde PedidosController.
  exports: [PostulacionesService],
})
export class PostulacionesModule {}
