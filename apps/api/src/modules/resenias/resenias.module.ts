import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ReseniasController } from "./resenias.controller.js";
import { ReseniasService } from "./resenias.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ReseniasController],
  providers: [ReseniasService],
  // ProfesionalesModule inyecta ReseniasService directo para los listados de
  // CL-09/PR-07, sin controller propio para esa ruta (mismo patron que
  // ContactosModule/PedidosController).
  exports: [ReseniasService],
})
export class ReseniasModule {}
