import type { CanalOtp } from "@fixeo/shared";

/**
 * Borde con el proveedor de OTP (Twilio Verify). Dos implementaciones:
 * `log` (desarrollo/tests, sin credenciales) y `twilio` (real).
 */
export interface ProveedorOtp {
  enviarCodigo(telefono: string, canal: CanalOtp): Promise<void>;
  verificarCodigo(telefono: string, codigo: string): Promise<boolean>;
}

export const PROVEEDOR_OTP = Symbol("PROVEEDOR_OTP");
