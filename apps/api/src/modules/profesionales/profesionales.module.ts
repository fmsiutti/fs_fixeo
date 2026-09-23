import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProfesionalesController } from "./profesionales.controller.js";
import { ProfesionalesService } from "./profesionales.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ProfesionalesController],
  providers: [ProfesionalesService],
  exports: [ProfesionalesService],
})
export class ProfesionalesModule {}
