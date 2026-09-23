import { z } from "zod";

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export const telefonoSchema = z
  .string()
  .regex(E164_REGEX, "El telefono debe estar en formato E.164 (ej: +5491122334455)");

export const CANALES_OTP = ["sms", "llamada"] as const;

export const canalOtpSchema = z.enum(CANALES_OTP);

export type CanalOtp = z.infer<typeof canalOtpSchema>;

export const solicitarOtpSchema = z.object({
  telefono: telefonoSchema,
  canal: canalOtpSchema.default("sms"),
});

export type SolicitarOtp = z.infer<typeof solicitarOtpSchema>;

export const confirmarOtpSchema = z.object({
  telefono: telefonoSchema,
  codigo: z.string().regex(/^\d{6}$/, "El codigo debe tener 6 digitos"),
});

export type ConfirmarOtp = z.infer<typeof confirmarOtpSchema>;
