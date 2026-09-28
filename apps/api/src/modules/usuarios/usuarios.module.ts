import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificacionesModule } from "../notificaciones/notificaciones.module.js";
import { UsuariosAdminService } from "./usuarios-admin.service.js";
import { UsuariosController } from "./usuarios.controller.js";
import { UsuariosService } from "./usuarios.service.js";

@Module({
  imports: [AuthModule, NotificacionesModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosAdminService],
  // UsuariosAdminService lo usa AdminUsuariosController (AdminModule, AD-03).
  exports: [UsuariosAdminService],
})
export class UsuariosModule {}
