import type {
  ResolverVerificacion,
  VerificacionColaPagina,
  VerificacionVista,
} from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

export const colaVerificacionesQueryKey = ["admin", "verificaciones"] as const;

export function obtenerColaVerificaciones(cursor?: string): Promise<VerificacionColaPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<VerificacionColaPagina>(`/admin/verificaciones${query}`);
}

export interface ResolverVerificacionParams {
  id: string;
  datos: ResolverVerificacion;
}

export function resolverVerificacion(
  params: ResolverVerificacionParams,
): Promise<VerificacionVista> {
  return fetchJson<VerificacionVista>(`/admin/verificaciones/${params.id}/resolver`, {
    method: "PATCH",
    body: JSON.stringify(params.datos),
  });
}
