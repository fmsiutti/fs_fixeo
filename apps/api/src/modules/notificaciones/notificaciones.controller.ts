import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { NotificacionPagina } from "@fixeo/shared";
import { LimiteSolicitudes } from "../../common/decorators/limite-solicitudes.decorator.js";
import { UsuarioActual } from "../../common/decorators/usuario-actual.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { LimiteSolicitudesGuard } from "../../common/guards/limite-solicitudes.guard.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { DesuscribirPushDto } from "./dto/desuscribir-push.dto.js";
import { ListarNotificacionesQueryDto } from "./dto/listar-notificaciones-query.dto.js";
import { SuscribirPushDto } from "./dto/suscribir-push.dto.js";
import { NotificacionesService } from "./notificaciones.service.js";

// CO-05: lista unificada + suscripcion push. La clave publica VAPID vive en
// NotificacionesPublicoController, sin guard (ver ese archivo).
@UseGuards(JwtAuthGuard)
@Controller("notificaciones")
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  listar(
    @UsuarioActual() usuario: Usuario,
    @Query() query: ListarNotificacionesQueryDto,
  ): Promise<NotificacionPagina> {
    return this.notificacionesService.listar(usuario.id, query.cursor);
  }

  @Patch(":id/leida")
  @HttpCode(HttpStatus.NO_CONTENT)
  marcarLeida(@UsuarioActual() usuario: Usuario, @Param("id") id: string): Promise<void> {
    return this.notificacionesService.marcarLeida(usuario.id, id);
  }

  @Post("push-suscripciones")
  @HttpCode(HttpStatus.NO_CONTENT)
  // Fix 2 (d), revision de codigo del slice 10: mismo patron que denuncias.controller.ts.
  @UseGuards(LimiteSolicitudesGuard)
  @LimiteSolicitudes({ maximo: 10, ventanaMs: 60 * 60 * 1000 })
  suscribirPush(@UsuarioActual() usuario: Usuario, @Body() dto: SuscribirPushDto): Promise<void> {
    return this.notificacionesService.suscribirPush(usuario.id, dto);
  }

  @Delete("push-suscripciones")
  @HttpCode(HttpStatus.NO_CONTENT)
  desuscribirPush(
    @UsuarioActual() usuario: Usuario,
    @Body() dto: DesuscribirPushDto,
  ): Promise<void> {
    return this.notificacionesService.desuscribirPush(usuario.id, dto.endpoint);
  }
}
