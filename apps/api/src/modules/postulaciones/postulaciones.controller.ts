import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type {
  ContadorDiarioPostulaciones,
  PostulacionesPagina,
  PostulacionVistaCliente,
  PostulacionVistaProfesional,
} from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { CrearPostulacionDto } from "./dto/crear-postulacion.dto.js";
import { ListarPostulacionesQueryDto } from "./dto/listar-postulaciones-query.dto.js";
import { PostulacionesService } from "./postulaciones.service.js";

// PR-04/PR-05: casos de uso del profesional sobre sus propias postulaciones
// (con @Roles). CL-08 (descartar/revertir) son acciones del cliente sobre una
// postulacion ajena: sin @Roles de clase, el service valida ownership via el
// pedido. El listado de postulaciones de un pedido (CL-08) vive en
// PedidosController, que inyecta este mismo service.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("postulaciones")
export class PostulacionesController {
  constructor(private readonly postulacionesService: PostulacionesService) {}

  @Post()
  @Roles("profesional")
  crear(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: CrearPostulacionDto,
  ): Promise<PostulacionVistaProfesional> {
    return this.postulacionesService.crear(usuario.id, dto);
  }

  @Get("contador-diario")
  @Roles("profesional")
  obtenerContadorDiario(@UsuarioActual() usuario: Usuario): Promise<ContadorDiarioPostulaciones> {
    return this.postulacionesService.obtenerContadorDiario(usuario.id);
  }

  @Get()
  @Roles("profesional")
  listar(
    @UsuarioActual() usuario: Usuario,
    @Query() query: ListarPostulacionesQueryDto,
  ): Promise<PostulacionesPagina> {
    return this.postulacionesService.listar(usuario.id, query);
  }

  @Patch(":id/retirar")
  @Roles("profesional")
  retirar(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
  ): Promise<PostulacionVistaProfesional> {
    return this.postulacionesService.retirar(usuario.id, id);
  }

  @Patch(":id/descartar")
  descartar(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
  ): Promise<PostulacionVistaCliente> {
    return this.postulacionesService.descartar(usuario.id, id);
  }

  @Patch(":id/revertir-descarte")
  revertirDescarte(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
  ): Promise<PostulacionVistaCliente> {
    return this.postulacionesService.revertirDescarte(usuario.id, id);
  }
}
