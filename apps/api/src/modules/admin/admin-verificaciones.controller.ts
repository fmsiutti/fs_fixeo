import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import type { VerificacionColaPagina, VerificacionVista } from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { ResolverVerificacionDto } from "../verificaciones/dto/resolver-verificacion.dto.js";
import { VerificacionColaQueryDto } from "../verificaciones/dto/verificacion-cola-query.dto.js";
import { VerificacionesService } from "../verificaciones/verificaciones.service.js";

// AD-01. Solo delega en VerificacionesService (apps/api/CLAUDE.md: el modulo
// `admin` es "solo controllers que delegan", sin logica propia).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/verificaciones")
export class AdminVerificacionesController {
  constructor(private readonly verificacionesService: VerificacionesService) {}

  // Soporte tambien puede ver la cola (es solo lectura en todo el back
  // office, apps/api/CLAUDE.md "Auth"); resolver queda solo para moderador.
  // El rol viaja al service para que soporte nunca reciba documentos
  // firmados (docs/dominio.md §13, "solo para moderadores").
  @Get()
  @Roles("moderador", "soporte")
  listarCola(
    @UsuarioActual() usuario: Usuario,
    @Query() query: VerificacionColaQueryDto,
  ): Promise<VerificacionColaPagina> {
    return this.verificacionesService.listarCola(
      usuario.id,
      usuario.rolActivo as "moderador" | "soporte",
      query.cursor,
    );
  }

  @Patch(":id/resolver")
  @Roles("moderador")
  resolver(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: ResolverVerificacionDto,
  ): Promise<VerificacionVista> {
    return this.verificacionesService.resolver(usuario.id, id, dto);
  }
}
