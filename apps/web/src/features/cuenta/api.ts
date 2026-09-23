import type { ActualizarUsuario, CambiarRol, UsuarioVista } from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

export function actualizarUsuario(input: ActualizarUsuario): Promise<UsuarioVista> {
  return fetchJson<UsuarioVista>("/usuarios/yo", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function cambiarRol(input: CambiarRol): Promise<UsuarioVista> {
  return fetchJson<UsuarioVista>("/usuarios/yo/rol", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function eliminarCuenta(): Promise<void> {
  return fetchJson<void>("/usuarios/yo", { method: "DELETE" });
}
