import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sendNotification, setVapidDetails, WebPushError } from "web-push";
import type { Env } from "../../config/env.schema.js";
import {
  SuscripcionInvalidaError,
  type PayloadPush,
  type ProveedorWebPush,
  type SuscripcionPush,
} from "./proveedor-web-push.js";

// Codigos con los que el propio navegador/push service confirma que ya
// descarto la suscripcion (el usuario desinstalo la PWA, limpio datos, etc.):
// no tiene sentido reintentar, hay que borrar la fila de `suscripcion_push`.
const CODIGOS_SUSCRIPCION_MUERTA = [404, 410];

// Fix 2 (c), revision de codigo del slice 10: sin timeout, un push service
// que nunca responde deja el socket abierto indefinidamente. `web-push`
// aborta el request y rechaza la promesa al llegar a este limite.
const TIMEOUT_ENVIO_MS = 5000;

/**
 * Driver real: usa el paquete `web-push` (VAPID). No se ejercita en tests
 * (requiere claves reales), pero debe compilar y tener la forma correcta.
 */
@Injectable()
export class WebPushVapidDriver implements ProveedorWebPush {
  private detallesConfigurados = false;

  constructor(private readonly configService: ConfigService<Env, true>) {}

  async enviar(suscripcion: SuscripcionPush, payload: PayloadPush): Promise<void> {
    this.asegurarVapidConfigurado();
    try {
      await sendNotification(suscripcion, JSON.stringify(payload), { timeout: TIMEOUT_ENVIO_MS });
    } catch (error) {
      if (error instanceof WebPushError && CODIGOS_SUSCRIPCION_MUERTA.includes(error.statusCode)) {
        throw new SuscripcionInvalidaError(suscripcion.endpoint);
      }
      throw error;
    }
  }

  /**
   * Nest instancia este provider siempre (el modulo lo registra aunque el
   * driver activo sea "log"), y `setVapidDetails` valida las claves de forma
   * sincronica y tira si estan vacias: llamarlo desde el constructor
   * romperia el arranque en desarrollo/tests, donde no hay claves VAPID
   * configuradas. Por eso se configura recien al primer envio real.
   */
  private asegurarVapidConfigurado(): void {
    if (this.detallesConfigurados) return;
    const clavePublica = this.configService.get("WEB_PUSH_VAPID_PUBLIC_KEY", { infer: true }) ?? "";
    const clavePrivada =
      this.configService.get("WEB_PUSH_VAPID_PRIVATE_KEY", { infer: true }) ?? "";
    setVapidDetails("mailto:soporte@fixeo.com.ar", clavePublica, clavePrivada);
    this.detallesConfigurados = true;
  }
}
