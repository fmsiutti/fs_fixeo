import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { CrearDenunciaDto } from "./dto/crear-denuncia.dto.js";
import { DenunciasService } from "./denuncias.service.js";

// Cualquier rol autenticado puede denunciar (cliente o profesional), sin
// @Roles: docs/dominio.md §11/§15 no restringe el canal de denuncia por rol.
@UseGuards(JwtAuthGuard)
@Controller("denuncias")
export class DenunciasController {
  constructor(private readonly denunciasService: DenunciasService) {}

  @Post()
  // Revision de codigo del slice 5: sin esto, una cuenta autenticada podia
  // crear denuncias sin ningun limite de tasa.
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 10, ventanaMs: 60 * 60 * 1000 })
  crear(@UsuarioActual() usuario: Usuario, @Body() dto: CrearDenunciaDto): Promise<{ id: string }> {
    return this.denunciasService.crear(usuario.id, dto);
  }
}
