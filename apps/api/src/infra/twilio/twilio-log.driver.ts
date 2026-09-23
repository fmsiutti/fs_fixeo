import { Injectable, Logger } from "@nestjs/common";
import type { CanalOtp } from "@fixeo/shared";
import type { ProveedorOtp } from "./proveedor-otp.js";

interface CodigoAlmacenado {
  codigo: string;
  expiraEn: number;
}

const VENCIMIENTO_MS = 10 * 60 * 1000;

// Codigo maestro solo para este driver (nunca se usa en produccion, se elige
// con TWILIO_DRIVER): sirve para cualquier telefono, sin tener que ir a leer
// el log cada vez. Anda incluso sin haber pedido un codigo antes.
const CODIGO_MAESTRO_DESARROLLO = "000000";

/** Enmascara todo menos los ultimos 4 digitos, para no loguear el telefono completo (CLAUDE.md §9). */
function enmascarar(telefono: string): string {
  return telefono.length <= 4
    ? telefono
    : `${"*".repeat(telefono.length - 4)}${telefono.slice(-4)}`;
}

/**
 * Driver de desarrollo/tests: no llama a Twilio, genera el codigo y lo loguea.
 * Nunca se usa en produccion (seleccionado por TWILIO_DRIVER).
 */
@Injectable()
export class TwilioLogDriver implements ProveedorOtp {
  private readonly logger = new Logger(TwilioLogDriver.name);
  private readonly codigos = new Map<string, CodigoAlmacenado>();

  enviarCodigo(telefono: string, canal: CanalOtp): Promise<void> {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    this.codigos.set(telefono, { codigo, expiraEn: Date.now() + VENCIMIENTO_MS });
    this.logger.log(
      `Codigo OTP para ${enmascarar(telefono)} (canal ${canal}): ${codigo}, vence en 10 min`,
    );
    return Promise.resolve();
  }

  verificarCodigo(telefono: string, codigo: string): Promise<boolean> {
    if (codigo === CODIGO_MAESTRO_DESARROLLO) {
      this.codigos.delete(telefono);
      return Promise.resolve(true);
    }

    const guardado = this.codigos.get(telefono);
    if (!guardado) return Promise.resolve(false);

    // Invalidar siempre (correcto o no): un codigo no se reusa.
    this.codigos.delete(telefono);

    if (Date.now() > guardado.expiraEn) return Promise.resolve(false);
    return Promise.resolve(guardado.codigo === codigo);
  }
}
