import { Module } from "@nestjs/common";
import { AlmacenamientoModule } from "../../infra/almacenamiento/almacenamiento.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EventosModule } from "../eventos/eventos.module.js";
import { NotificacionesModule } from "../notificaciones/notificaciones.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { VerificacionesController } from "./verificaciones.controller.js";
import { VerificacionesService } from "./verificaciones.service.js";

@Module({
  imports: [
    AuthModule,
    AlmacenamientoModule,
    EventosModule,
    NotificacionesModule,
    ParametrosModule,
  ],
  controllers: [VerificacionesController],
  providers: [VerificacionesService],
  exports: [VerificacionesService],
})
export class VerificacionesModule {}
