import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { RegistrarEventoDto } from "./dto/registrar-evento.dto.js";
import { RegistrarPostulacionIniciadaDto } from "./dto/registrar-postulacion-iniciada.dto.js";
import { EventosService } from "./eventos.service.js";

/**
 * Publico y sin sesion a proposito: el asistente de publicacion (CL-02 a
 * CL-06) es anonimo hasta el final, y estos eventos miden el embudo completo.
 * `registrarEventoSchema` limita `tipo` a los dos eventos que le corresponden
 * al cliente disparar (asistente_iniciado, asistente_paso_completado); el
 * resto los registra el backend directo desde el service correspondiente.
 */
@Controller("eventos")
export class EventosController {
  constructor(private readonly eventosService: EventosService) {}

  @Post()
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 60, ventanaMs: 60_000 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async registrar(@Body() dto: RegistrarEventoDto): Promise<void> {
    await this.eventosService.registrarDelCliente(dto);
  }

  // PR-04 (docs/dominio.md §10): a diferencia de arriba, este evento lo
  // dispara un profesional ya autenticado (abrir el formulario de
  // postulacion), asi que exige sesion y rol en vez del limite por IP.
  @Post("postulacion-iniciada")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("profesional")
  @HttpCode(HttpStatus.NO_CONTENT)
  async registrarPostulacionIniciada(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: RegistrarPostulacionIniciadaDto,
  ): Promise<void> {
    await this.eventosService.registrarPostulacionIniciada(usuario.id, dto);
  }
}
