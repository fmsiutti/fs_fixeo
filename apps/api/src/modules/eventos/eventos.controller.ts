import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import { RegistrarEventoDto } from "./dto/registrar-evento.dto.js";
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
}
