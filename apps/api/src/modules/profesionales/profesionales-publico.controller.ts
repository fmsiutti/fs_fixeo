import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { PerfilProfesionalVistaPublica } from "@fixeo/shared";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { ProfesionalesService } from "./profesionales.service.js";

// CL-09: cualquier usuario autenticado puede ver un perfil publico, sin
// restriccion de rol activo. Controller aparte de "perfil-profesional"
// (que siempre opera sobre el perfil del usuario autenticado) porque la ruta
// y el sujeto son distintos: aca ":id" es el perfil de un tercero.
@UseGuards(JwtAuthGuard)
@Controller("profesionales")
export class ProfesionalesPublicoController {
  constructor(private readonly profesionalesService: ProfesionalesService) {}

  @Get(":id")
  obtenerPublico(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
  ): Promise<PerfilProfesionalVistaPublica> {
    return this.profesionalesService.obtenerPerfilPublico(usuario, id);
  }
}
