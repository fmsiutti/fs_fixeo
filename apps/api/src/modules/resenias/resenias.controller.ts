import { Body, Controller, Param, Patch, UseGuards } from "@nestjs/common";
import type { ReseniaVista } from "@fixeo/shared";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { ResponderReseniaDto } from "./dto/responder-resenia.dto.js";
import { ReseniasService } from "./resenias.service.js";

// El listado publico de resenias de un profesional cuelga de
// GET /profesionales/:id/resenias y GET /perfil-profesional/resenias
// (profesionales.module.ts importa ReseniasService): mantiene el mismo
// prefijo de ruta que el resto de lo que expone un perfil profesional
// (CL-09/PR-07), en vez de duplicarlo aca con un filtro por query.
@UseGuards(JwtAuthGuard)
@Controller("resenias")
export class ReseniasController {
  constructor(private readonly reseniasService: ReseniasService) {}

  @Patch(":id/responder")
  @UseGuards(RolesGuard, LimiteSolicitudesGuard)
  @Roles("profesional")
  @LimiteSolicitudes({ maximo: 10, ventanaMs: 60 * 60 * 1000 })
  responder(
    @UsuarioActual() usuario: Usuario,
    @Param("id") id: string,
    @Body() dto: ResponderReseniaDto,
  ): Promise<ReseniaVista> {
    return this.reseniasService.responder(usuario.id, id, dto.respuesta);
  }
}
