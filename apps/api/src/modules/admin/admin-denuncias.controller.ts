import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import type { DenunciaModeracionPagina, DenunciaModeracionVista } from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { DenunciaModeracionColaQueryDto } from "../denuncias/dto/denuncia-moderacion-cola-query.dto.js";
import { ResolverDenunciaModeracionDto } from "../denuncias/dto/resolver-denuncia-moderacion.dto.js";
import { DenunciasService } from "../denuncias/denuncias.service.js";

// AD-02, tercera cola (D14): denuncias de perfil, postulacion y resenia. Solo
// delega en DenunciasService (apps/api/CLAUDE.md: el modulo `admin` es "solo
// controllers que delegan", sin logica propia).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/denuncias")
export class AdminDenunciasController {
  constructor(private readonly denunciasService: DenunciasService) {}

  // Soporte tambien puede ver la cola (solo lectura en todo el back office);
  // resolver queda solo para moderador.
  @Get()
  @Roles("moderador", "soporte")
  listar(@Query() query: DenunciaModeracionColaQueryDto): Promise<DenunciaModeracionPagina> {
    return this.denunciasService.listarNoPedido(query.cursor);
  }

  @Patch(":id/resolver")
  @Roles("moderador")
  resolver(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: ResolverDenunciaModeracionDto,
  ): Promise<DenunciaModeracionVista> {
    return this.denunciasService.resolverNoPedido(usuario.id, id, dto);
  }
}
