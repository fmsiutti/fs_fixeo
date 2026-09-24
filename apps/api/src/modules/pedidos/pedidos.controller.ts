import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type {
  PedidoFeedPagina,
  PedidoResumenVista,
  PedidoVista,
  PedidoVistaProfesional,
  PostulacionVistaCliente,
} from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { PostulacionesService } from "../postulaciones/postulaciones.service.js";
import { CrearPedidoDto } from "./dto/crear-pedido.dto.js";
import { EditarPedidoDto } from "./dto/editar-pedido.dto.js";
import { PedidoFeedQueryDto } from "./dto/pedido-feed-query.dto.js";
import { PedidosFeedService } from "./pedidos-feed.service.js";
import { PedidosService } from "./pedidos.service.js";

@UseGuards(JwtAuthGuard)
@Controller("pedidos")
export class PedidosController {
  constructor(
    private readonly pedidosService: PedidosService,
    private readonly pedidosFeedService: PedidosFeedService,
    private readonly postulacionesService: PostulacionesService,
  ) {}

  @Post()
  crear(@UsuarioActual() usuario: Usuario, @Body() dto: CrearPedidoDto): Promise<PedidoVista> {
    return this.pedidosService.crear(usuario.id, dto);
  }

  @Get()
  listarPropios(@UsuarioActual() usuario: Usuario): Promise<PedidoResumenVista[]> {
    return this.pedidosService.listarPropios(usuario.id);
  }

  // PR-02. Antes de ":id" para que esa ruta generica no la intercepte.
  @Get("feed")
  @UseGuards(RolesGuard)
  @Roles("profesional")
  listarFeed(
    @UsuarioActual() usuario: Usuario,
    @Query() query: PedidoFeedQueryDto,
  ): Promise<PedidoFeedPagina> {
    return this.pedidosFeedService.listarFeed(usuario.id, query);
  }

  // PR-03. Misma razon que "feed": tiene que ir antes de ":id".
  @Get("feed/:id")
  @UseGuards(RolesGuard)
  @Roles("profesional")
  obtenerDelFeed(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
  ): Promise<PedidoVistaProfesional> {
    return this.pedidosFeedService.obtenerDelFeed(usuario.id, id);
  }

  @Get(":id")
  obtenerPropio(@UsuarioActual() usuario: Usuario, @Param("id") id: string): Promise<PedidoVista> {
    return this.pedidosService.obtenerPropio(usuario.id, id);
  }

  @Patch(":id/cancelar")
  cancelar(@UsuarioActual() usuario: Usuario, @Param("id") id: string): Promise<PedidoVista> {
    return this.pedidosService.cancelar(usuario.id, id);
  }

  // CL-08.
  @Get(":id/postulaciones")
  listarPostulaciones(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
  ): Promise<PostulacionVistaCliente[]> {
    return this.postulacionesService.listarDelPedido(usuario.id, id);
  }

  @Patch(":id")
  editar(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: EditarPedidoDto,
  ): Promise<PedidoVista> {
    return this.pedidosService.editar(usuario.id, id, dto);
  }
}
