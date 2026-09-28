import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type {
  NotaInternaVista,
  UsuarioBusquedaPagina,
  UsuarioDetalleAdminVista,
  UsuarioVista,
} from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { CrearNotaInternaDto } from "../usuarios/dto/crear-nota-interna.dto.js";
import { SuspenderUsuarioDto } from "../usuarios/dto/suspender-usuario.dto.js";
import { UsuarioBusquedaQueryDto } from "../usuarios/dto/usuario-busqueda-query.dto.js";
import { UsuariosAdminService } from "../usuarios/usuarios-admin.service.js";

// AD-03. Solo delega en UsuariosAdminService (apps/api/CLAUDE.md: el modulo
// `admin` es "solo controllers que delegan", sin logica propia).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/usuarios")
export class AdminUsuariosController {
  constructor(private readonly usuariosAdminService: UsuariosAdminService) {}

  // Soporte es solo lectura en todo el back office (apps/api/CLAUDE.md
  // "Auth"); suspender, reactivar y anotar quedan solo para moderador.
  @Get()
  @Roles("moderador", "soporte")
  buscar(@Query() query: UsuarioBusquedaQueryDto): Promise<UsuarioBusquedaPagina> {
    return this.usuariosAdminService.buscar(query.buscar, query.cursor);
  }

  @Get(":id")
  @Roles("moderador", "soporte")
  obtenerDetalle(@Param("id") id: string): Promise<UsuarioDetalleAdminVista> {
    return this.usuariosAdminService.obtenerDetalle(id);
  }

  @Patch(":id/suspender")
  @Roles("moderador")
  suspender(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: SuspenderUsuarioDto,
  ): Promise<UsuarioVista> {
    return this.usuariosAdminService.suspender(usuario.id, id, dto);
  }

  @Patch(":id/reactivar")
  @Roles("moderador")
  reactivar(@UsuarioActual() usuario: Usuario, @Param("id") id: string): Promise<UsuarioVista> {
    return this.usuariosAdminService.reactivar(usuario.id, id);
  }

  @Post(":id/notas")
  @Roles("moderador")
  crearNota(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: CrearNotaInternaDto,
  ): Promise<NotaInternaVista> {
    return this.usuariosAdminService.crearNota(usuario.id, id, dto);
  }
}
