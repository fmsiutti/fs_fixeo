import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { VerificacionesModule } from "../verificaciones/verificaciones.module.js";
import { AdminVerificacionesController } from "./admin-verificaciones.controller.js";

@Module({
  imports: [AuthModule, VerificacionesModule],
  controllers: [AdminVerificacionesController],
})
export class AdminModule {}
