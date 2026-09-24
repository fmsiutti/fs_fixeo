import type { PerfilProfesionalVistaPublica } from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

export function perfilProfesionalPublicoQueryKey(id: string): readonly [string, string, string] {
  return ["profesionales", id, "publico"] as const;
}

/** CL-09: perfil publico de un profesional, visto por cualquier usuario con sesion. */
export function obtenerPerfilProfesionalPublico(
  id: string,
): Promise<PerfilProfesionalVistaPublica> {
  return fetchJson<PerfilProfesionalVistaPublica>(`/profesionales/${id}`);
}
