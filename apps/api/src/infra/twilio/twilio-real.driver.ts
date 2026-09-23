import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import twilio from "twilio";
import type { CanalOtp } from "@fixeo/shared";
import type { Env } from "../../config/env.schema.js";
import type { ProveedorOtp } from "./proveedor-otp.js";

/**
 * Driver real: usa Twilio Verify. No se ejercita en tests (requiere
 * credenciales reales), pero debe compilar y tener la forma correcta.
 */
@Injectable()
export class TwilioRealDriver implements ProveedorOtp {
  private readonly client: ReturnType<typeof twilio>;
  private readonly verifyServiceSid: string;

  constructor(configService: ConfigService<Env, true>) {
    const accountSid = configService.get("TWILIO_ACCOUNT_SID", { infer: true }) ?? "";
    const authToken = configService.get("TWILIO_AUTH_TOKEN", { infer: true }) ?? "";
    this.verifyServiceSid = configService.get("TWILIO_VERIFY_SERVICE_SID", { infer: true }) ?? "";
    this.client = twilio(accountSid, authToken);
  }

  async enviarCodigo(telefono: string, canal: CanalOtp): Promise<void> {
    await this.client.verify.v2
      .services(this.verifyServiceSid)
      .verifications.create({ to: telefono, channel: canal === "llamada" ? "call" : "sms" });
  }

  async verificarCodigo(telefono: string, codigo: string): Promise<boolean> {
    const resultado = await this.client.verify.v2
      .services(this.verifyServiceSid)
      .verificationChecks.create({ to: telefono, code: codigo });
    return resultado.status === "approved";
  }
}
