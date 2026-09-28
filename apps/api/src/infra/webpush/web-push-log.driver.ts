import { Injectable, Logger } from "@nestjs/common";
import type { PayloadPush, ProveedorWebPush, SuscripcionPush } from "./proveedor-web-push.js";

/**
 * Driver de desarrollo/tests: no llama a ningun servicio de push, solo
 * loguea lo que "enviaria". Nunca tira `SuscripcionInvalidaError`. Mismo
 * espiritu que TwilioLogDriver.
 */
@Injectable()
export class WebPushLogDriver implements ProveedorWebPush {
  private readonly logger = new Logger(WebPushLogDriver.name);

  enviar(suscripcion: SuscripcionPush, payload: PayloadPush): Promise<void> {
    this.logger.log(
      `Push a ${suscripcion.endpoint.slice(-12)}: "${payload.titulo}" — ${payload.cuerpo} (${payload.ruta})`,
    );
    return Promise.resolve();
  }
}
