import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import type { PerfilProfesionalVistaPublica, ReseniaPagina } from "@fixeo/shared";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { ListarReseniasQueryDto } from "../resenias/dto/listar-resenias-query.dto.js";
import { ReseniasService } from "../resenias/resenias.service.js";
import { ProfesionalesService } from "./profesionales.service.js";

// CL-09: cualquier usuario autenticado puede ver un perfil publico, sin
// restriccion de rol activo. Controller aparte de "perfil-profesional"
// (que siempre opera sobre el perfil del usuario autenticado) porque la ruta
// y el sujeto son distintos: aca ":id" es el perfil de un tercero.
@UseGuards(JwtAuthGuard)
@Controller("profesionales")
export class ProfesionalesPublicoController {
  constructor(
    private readonly profesionalesService: ProfesionalesService,
    private readonly reseniasService: ReseniasService,
  ) {}

  @Get(":id")
  obtenerPublico(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
  ): Promise<PerfilProfesionalVistaPublica> {
    return this.profesionalesService.obtenerPerfilPublico(usuario, id);
  }

  // CL-09: reseñas publicas del perfil, paginadas por cursor.
  @Get(":id/resenias")
  listarResenias(
    @Param("id") id: string,
    @Query() query: ListarReseniasQueryDto,
  ): Promise<ReseniaPagina> {
    return this.reseniasService.listarDeProfesional(id, query.cursor);
  }
}
