import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EventosController } from "./eventos.controller.js";
import { EventosService } from "./eventos.service.js";

// AuthModule: POST /eventos/postulacion-iniciada (PR-04) exige sesion y rol,
// a diferencia de POST /eventos (publico, sin sesion); JwtAuthGuard/RolesGuard
// necesitan lo que expone AuthModule (JwtService, etc.).
@Module({
  imports: [AuthModule],
  controllers: [EventosController],
  providers: [EventosService],
  exports: [EventosService],
})
export class EventosModule {}
