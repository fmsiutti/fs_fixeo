import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EventosModule } from "../eventos/eventos.module.js";
import { ProfesionalesController } from "./profesionales.controller.js";
import { ProfesionalesPublicoController } from "./profesionales-publico.controller.js";
import { ProfesionalesService } from "./profesionales.service.js";

@Module({
  imports: [AuthModule, EventosModule],
  controllers: [ProfesionalesController, ProfesionalesPublicoController],
  providers: [ProfesionalesService],
  exports: [ProfesionalesService],
})
export class ProfesionalesModule {}
