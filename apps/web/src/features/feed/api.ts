import type {
  CrearDenuncia,
  PedidoFeedPagina,
  PedidoVistaProfesional,
  Urgencia,
} from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

// Filtros de PR-02 sin el cursor: la paginacion la maneja useInfiniteQuery
// aparte (packages/shared ya incluye `cursor` en pedidoFeedFiltrosSchema
// porque el DTO de la api usa el mismo schema para toda la query string).
export interface FiltrosFeedTrabajos {
  categoriaId?: string;
  urgencia?: Urgencia;
  conFotos?: boolean;
  sinPostulaciones?: boolean;
  distanciaMaxKm?: number;
}

/**
 * Arma la query string del feed. Los filtros booleanos son opt-in: ausentes
 * significa no aplicar el filtro. Nunca se manda explícitamente en `false`,
 * solo se agregan a la query cuando son `true`.
 */
export function construirQueryFeed(filtros: FiltrosFeedTrabajos, cursor?: string): string {
  const params = new URLSearchParams();
  if (filtros.categoriaId) params.set("categoriaId", filtros.categoriaId);
  if (filtros.urgencia) params.set("urgencia", filtros.urgencia);
  if (filtros.conFotos) params.set("conFotos", "true");
  if (filtros.sinPostulaciones) params.set("sinPostulaciones", "true");
  if (filtros.distanciaMaxKm !== undefined) {
    params.set("distanciaMaxKm", String(filtros.distanciaMaxKm));
  }
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function hayFiltrosActivos(filtros: FiltrosFeedTrabajos): boolean {
  return Object.values(filtros).some((valor) => valor !== undefined && valor !== false);
}

export function feedTrabajosQueryKey(
  filtros: FiltrosFeedTrabajos,
): readonly [string, FiltrosFeedTrabajos] {
  return ["feed-trabajos", filtros] as const;
}

export function obtenerFeedTrabajos(
  filtros: FiltrosFeedTrabajos,
  cursor?: string,
): Promise<PedidoFeedPagina> {
  const query = construirQueryFeed(filtros, cursor);
  return fetchJson<PedidoFeedPagina>(`/pedidos/feed${query ? `?${query}` : ""}`);
}

export function detalleFeedTrabajoQueryKey(id: string): readonly [string, string, string] {
  return ["feed-trabajos", "detalle", id] as const;
}

export function obtenerDetalleFeedTrabajo(id: string): Promise<PedidoVistaProfesional> {
  return fetchJson<PedidoVistaProfesional>(`/pedidos/feed/${id}`);
}

export function crearDenuncia(input: CrearDenuncia): Promise<{ id: string }> {
  return fetchJson<{ id: string }>("/denuncias", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
