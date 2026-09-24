import type { ReseniaPagina, ReseniaVista, ResponderResenia } from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

// CL-09: reseñas publicas de un profesional, paginadas por cursor.
export function reseniasDeProfesionalQueryKey(
  profesionalId: string,
): readonly [string, string, string] {
  return ["profesionales", profesionalId, "resenias"] as const;
}

export function obtenerReseniasDeProfesional(
  profesionalId: string,
  cursor?: string,
): Promise<ReseniaPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<ReseniaPagina>(`/profesionales/${profesionalId}/resenias${query}`);
}

// PR-07: reseñas del propio perfil profesional autenticado, paginadas por cursor.
export const misReseniasQueryKey = ["perfil-profesional", "resenias"] as const;

export function obtenerMisResenias(cursor?: string): Promise<ReseniaPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<ReseniaPagina>(`/perfil-profesional/resenias${query}`);
}

// docs/dominio.md §8: "el profesional puede responder una vez, publicamente".
export function responderResenia(id: string, datos: ResponderResenia): Promise<ReseniaVista> {
  return fetchJson<ReseniaVista>(`/resenias/${id}/responder`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}
