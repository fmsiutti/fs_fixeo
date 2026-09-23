import { Module } from "@nestjs/common";
import { AlmacenamientoModule } from "../../infra/almacenamiento/almacenamiento.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EventosModule } from "../eventos/eventos.module.js";
import { ParametrosModule } from "../parametros/parametros.module.js";
import { PedidosController } from "./pedidos.controller.js";
import { PedidosService } from "./pedidos.service.js";

@Module({
  imports: [AuthModule, ParametrosModule, AlmacenamientoModule, EventosModule],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
