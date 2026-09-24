import { Module } from "@nestjs/common";
import { EventosModule } from "../eventos/eventos.module.js";
import { NotificacionesModule } from "../notificaciones/notificaciones.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { ContactosService } from "./contactos.service.js";

// Sin controller propio: PedidosController (CL-10) y PostulacionesController
// (CL-08/PR-06) exponen sus endpoints delegando en este service.
@Module({
  imports: [ParametrosModule, EventosModule, NotificacionesModule],
  providers: [ContactosService],
  exports: [ContactosService],
})
export class ContactosModule {}
