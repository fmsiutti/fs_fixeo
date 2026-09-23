import { Module } from "@nestjs/common";
import { AlmacenamientoModule } from "../../infra/almacenamiento/almacenamiento.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { ArchivosController } from "./archivos.controller.js";
import { ArchivosService } from "./archivos.service.js";

@Module({
  imports: [AlmacenamientoModule, ParametrosModule],
  controllers: [ArchivosController],
  providers: [ArchivosService],
})
export class ArchivosModule {}
