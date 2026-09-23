import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type { UsuarioVista } from "@fixeo/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { UsuariosService } from "./usuarios.service.js";
import { ActualizarUsuarioDto } from "./dto/actualizar-usuario.dto.js";
import { CambiarRolDto } from "./dto/cambiar-rol.dto.js";
import { NOMBRE_COOKIE_REFRESH } from "../auth/auth.constants.js";

@UseGuards(JwtAuthGuard)
@Controller("usuarios")
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get("yo")
  obtenerYo(@UsuarioActual() usuario: Usuario): UsuarioVista {
    return this.usuariosService.obtenerVista(usuario);
  }

  @Patch("yo")
  actualizarYo(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: ActualizarUsuarioDto,
  ): Promise<UsuarioVista> {
    return this.usuariosService.actualizar(usuario.id, dto);
  }

  @Patch("yo/rol")
  cambiarRol(@UsuarioActual() usuario: Usuario, @Body() dto: CambiarRolDto): Promise<UsuarioVista> {
    return this.usuariosService.cambiarRol(usuario.id, dto);
  }

  @Delete("yo")
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminarYo(
    @UsuarioActual() usuario: Usuario,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.usuariosService.eliminar(usuario.id);
    res.clearCookie(NOMBRE_COOKIE_REFRESH, { path: "/" });
  }
}
