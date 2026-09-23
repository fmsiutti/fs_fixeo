import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { PedidoResumenVista, PedidoVista } from "@fixeo/shared";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { CrearPedidoDto } from "./dto/crear-pedido.dto.js";
import { EditarPedidoDto } from "./dto/editar-pedido.dto.js";
import { PedidosService } from "./pedidos.service.js";

@UseGuards(JwtAuthGuard)
@Controller("pedidos")
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Post()
  crear(@UsuarioActual() usuario: Usuario, @Body() dto: CrearPedidoDto): Promise<PedidoVista> {
    return this.pedidosService.crear(usuario.id, dto);
  }

  @Get()
  listarPropios(@UsuarioActual() usuario: Usuario): Promise<PedidoResumenVista[]> {
    return this.pedidosService.listarPropios(usuario.id);
  }

  @Get(":id")
  obtenerPropio(@UsuarioActual() usuario: Usuario, @Param("id") id: string): Promise<PedidoVista> {
    return this.pedidosService.obtenerPropio(usuario.id, id);
  }

  @Patch(":id/cancelar")
  cancelar(@UsuarioActual() usuario: Usuario, @Param("id") id: string): Promise<PedidoVista> {
    return this.pedidosService.cancelar(usuario.id, id);
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
