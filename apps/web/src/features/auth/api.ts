import type { ConfirmarOtp, SolicitarOtp, UsuarioVista } from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

export interface RespuestaSesion {
  accessToken: string;
  usuario: UsuarioVista;
}

export function solicitarOtp(input: SolicitarOtp): Promise<void> {
  return fetchJson<void>("/auth/otp/solicitar", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmarOtp(input: ConfirmarOtp): Promise<RespuestaSesion> {
  return fetchJson<RespuestaSesion>("/auth/otp/confirmar", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Refresh "de verdad": revalida la cookie al abrir la app y devuelve el usuario completo. */
export function refrescarSesion(): Promise<RespuestaSesion> {
  return fetchJson<RespuestaSesion>("/auth/refresh", { method: "POST" });
}

export function cerrarSesionApi(): Promise<void> {
  return fetchJson<void>("/auth/logout", { method: "POST" });
}
