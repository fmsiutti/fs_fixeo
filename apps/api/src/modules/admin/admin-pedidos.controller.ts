import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import type { PedidoModeracionPagina, PedidoModeracionVista } from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { PedidoModeracionColaQueryDto } from "../pedidos/dto/pedido-moderacion-cola-query.dto.js";
import { ResolverEnRevisionDto } from "../pedidos/dto/resolver-en-revision.dto.js";
import { ResolverPedidoDenunciadoDto } from "../pedidos/dto/resolver-pedido-denunciado.dto.js";
import { PedidosModeracionService } from "../pedidos/pedidos-moderacion.service.js";

// AD-02. Solo delega en PedidosModeracionService (apps/api/CLAUDE.md: el
// modulo `admin` es "solo controllers que delegan", sin logica propia).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/pedidos")
export class AdminPedidosController {
  constructor(private readonly pedidosModeracionService: PedidosModeracionService) {}

  // Soporte tambien puede ver las dos colas (solo lectura en todo el back
  // office); resolver queda solo para moderador.
  @Get("en-revision")
  @Roles("moderador", "soporte")
  listarEnRevision(@Query() query: PedidoModeracionColaQueryDto): Promise<PedidoModeracionPagina> {
    return this.pedidosModeracionService.listarEnRevision(query.cursor);
  }

  @Get("denunciados")
  @Roles("moderador", "soporte")
  listarDenunciados(@Query() query: PedidoModeracionColaQueryDto): Promise<PedidoModeracionPagina> {
    return this.pedidosModeracionService.listarDenunciados(query.cursor);
  }

  @Patch(":id/resolver-revision")
  @Roles("moderador")
  resolverEnRevision(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: ResolverEnRevisionDto,
  ): Promise<PedidoModeracionVista> {
    return this.pedidosModeracionService.resolverEnRevision(usuario.id, id, dto);
  }

  @Patch(":id/resolver-denuncia")
  @Roles("moderador")
  resolverDenuncia(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: ResolverPedidoDenunciadoDto,
  ): Promise<PedidoModeracionVista> {
    return this.pedidosModeracionService.resolverDenuncia(usuario.id, id, dto);
  }
}
