import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CatalogoModule } from "../catalogo/catalogo.module.js";
import { DenunciasModule } from "../denuncias/denuncias.module.js";
import { EventosModule } from "../eventos/eventos.module.js";
import { PedidosModule } from "../pedidos/pedidos.module.js";
import { UsuariosModule } from "../usuarios/usuarios.module.js";
import { VerificacionesModule } from "../verificaciones/verificaciones.module.js";
import { AdminCatalogoController } from "./admin-catalogo.controller.js";
import { AdminDenunciasController } from "./admin-denuncias.controller.js";
import { AdminMetricasController } from "./admin-metricas.controller.js";
import { AdminPedidosController } from "./admin-pedidos.controller.js";
import { AdminUsuariosController } from "./admin-usuarios.controller.js";
import { AdminVerificacionesController } from "./admin-verificaciones.controller.js";

@Module({
  imports: [
    AuthModule,
    VerificacionesModule,
    PedidosModule,
    UsuariosModule,
    CatalogoModule,
    EventosModule,
    DenunciasModule,
  ],
  controllers: [
    AdminVerificacionesController,
    AdminPedidosController,
    AdminUsuariosController,
    AdminCatalogoController,
    AdminMetricasController,
    AdminDenunciasController,
  ],
})
export class AdminModule {}
