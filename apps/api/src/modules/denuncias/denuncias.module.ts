import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DenunciasController } from "./denuncias.controller.js";
import { DenunciasService } from "./denuncias.service.js";

@Module({
  imports: [AuthModule],
  controllers: [DenunciasController],
  providers: [DenunciasService],
  // AdminDenunciasController (AD-02, D14) inyecta DenunciasService desde AdminModule.
  exports: [DenunciasService],
})
export class DenunciasModule {}
