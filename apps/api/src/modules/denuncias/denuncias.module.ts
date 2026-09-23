import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DenunciasController } from "./denuncias.controller.js";
import { DenunciasService } from "./denuncias.service.js";

@Module({
  imports: [AuthModule],
  controllers: [DenunciasController],
  providers: [DenunciasService],
})
export class DenunciasModule {}
