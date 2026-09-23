import { Body, Controller, Get, Patch, Put, UseGuards } from "@nestjs/common";
import type { PerfilProfesionalVistaPropia } from "@fixeo/shared";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { ArmarPerfilDto } from "./dto/armar-perfil.dto.js";
import { GuardarOficiosDto } from "./dto/guardar-oficios.dto.js";
import { ZonaCoberturaDto } from "./dto/zona-cobertura.dto.js";
import { ProfesionalesService } from "./profesionales.service.js";

// Sin @Roles: armar el perfil profesional no depende del rol_activo (un
// usuario todavia en modo cliente puede prepararlo antes de alternar).
@UseGuards(JwtAuthGuard)
@Controller("perfil-profesional")
export class ProfesionalesController {
  constructor(private readonly profesionalesService: ProfesionalesService) {}

  @Get()
  obtenerPropio(@UsuarioActual() usuario: Usuario): Promise<PerfilProfesionalVistaPropia> {
    return this.profesionalesService.obtenerPropio(usuario.id);
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
}
