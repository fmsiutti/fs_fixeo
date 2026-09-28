import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";

// La clave publica VAPID es publica por diseño del protocolo (no es un
// secreto): el front la necesita antes de tener sesion activa para pedir
// permiso de push, asi que este endpoint queda sin JwtAuthGuard, en un
// controller aparte del resto de "notificaciones" (que si exige sesion).
@Controller("notificaciones")
export class NotificacionesPublicoController {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  @Get("vapid-clave-publica")
  obtenerClavePublica(): { clavePublica: string } {
    const clavePublica = this.configService.get("WEB_PUSH_VAPID_PUBLIC_KEY", { infer: true }) ?? "";
    return { clavePublica };
  }
}
