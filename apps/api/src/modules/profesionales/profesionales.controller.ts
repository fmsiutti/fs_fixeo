import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  PerfilProfesionalVistaPropia,
  PlantillaMensajeVista,
  ReseniaPagina,
} from "@fixeo/shared";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { ListarReseniasQueryDto } from "../resenias/dto/listar-resenias-query.dto.js";
import { ReseniasService } from "../resenias/resenias.service.js";
import { ArmarPerfilDto } from "./dto/armar-perfil.dto.js";
import { CrearPlantillaMensajeDto } from "./dto/crear-plantilla-mensaje.dto.js";
import { GuardarOficiosDto } from "./dto/guardar-oficios.dto.js";
import { ZonaCoberturaDto } from "./dto/zona-cobertura.dto.js";
import { ProfesionalesService } from "./profesionales.service.js";

// Sin @Roles: armar el perfil profesional no depende del rol_activo (un
// usuario todavia en modo cliente puede prepararlo antes de alternar).
@UseGuards(JwtAuthGuard)
@Controller("perfil-profesional")
export class ProfesionalesController {
  constructor(
    private readonly profesionalesService: ProfesionalesService,
    private readonly reseniasService: ReseniasService,
  ) {}

  @Get()
  obtenerPropio(@UsuarioActual() usuario: Usuario): Promise<PerfilProfesionalVistaPropia> {
    return this.profesionalesService.obtenerPropio(usuario.id);
  }

  // PR-07: reseñas publicas del propio perfil, paginadas por cursor.
  @Get("resenias")
  listarResenias(
    @UsuarioActual() usuario: Usuario,
    @Query() query: ListarReseniasQueryDto,
  ): Promise<ReseniaPagina> {
    return this.profesionalesService
      .obtenerPropio(usuario.id)
      .then((perfil) => this.reseniasService.listarDeProfesional(perfil.id, query.cursor));
  }

  @Patch()
  armarPerfil(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: ArmarPerfilDto,
  ): Promise<PerfilProfesionalVistaPropia> {
    return this.profesionalesService.armarPerfil(usuario.id, dto);
  }

  @Put("oficios")
  guardarOficios(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: GuardarOficiosDto,
  ): Promise<PerfilProfesionalVistaPropia> {
    return this.profesionalesService.guardarOficios(usuario.id, dto);
  }

  @Put("zona")
  guardarZona(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: ZonaCoberturaDto,
  ): Promise<PerfilProfesionalVistaPropia> {
    return this.profesionalesService.guardarZona(usuario.id, dto);
  }

  @Patch("pausar")
  pausar(@UsuarioActual() usuario: Usuario): Promise<PerfilProfesionalVistaPropia> {
    return this.profesionalesService.togglePausa(usuario.id);
  }

  // PR-04/PR-07: plantillas de mensaje del profesional.
  @Get("plantillas")
  listarPlantillas(@UsuarioActual() usuario: Usuario): Promise<PlantillaMensajeVista[]> {
    return this.profesionalesService.listarPlantillas(usuario.id);
  }

  @Post("plantillas")
  crearPlantilla(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: CrearPlantillaMensajeDto,
  ): Promise<PlantillaMensajeVista> {
    return this.profesionalesService.crearPlantilla(usuario.id, dto);
  }

  @Delete("plantillas/:id")
  borrarPlantilla(@UsuarioActual() usuario: Usuario, @Param("id") id: string): Promise<void> {
    return this.profesionalesService.borrarPlantilla(usuario.id, id);
  }
}
