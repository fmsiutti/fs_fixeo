import type { DesuscribirPush, NotificacionPagina, SuscribirPush } from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

// --- CO-05: lista unificada ---

export const notificacionesQueryKey = ["notificaciones"] as const;

export function obtenerNotificaciones(cursor?: string): Promise<NotificacionPagina> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetchJson<NotificacionPagina>(`/notificaciones${query}`);
}

export function marcarNotificacionLeida(id: string): Promise<void> {
  return fetchJson<void>(`/notificaciones/${id}/leida`, { method: "PATCH" });
}

// --- CO-06: avisos push. La clave publica no exige sesion (ver
// NotificacionesPublicoController); suscribir/desuscribir si. ---

export function obtenerVapidClavePublica(): Promise<{ clavePublica: string }> {
  return fetchJson<{ clavePublica: string }>("/notificaciones/vapid-clave-publica");
}

export function suscribirPush(datos: SuscribirPush): Promise<void> {
  return fetchJson<void>("/notificaciones/push-suscripciones", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function desuscribirPush(datos: DesuscribirPush): Promise<void> {
  return fetchJson<void>("/notificaciones/push-suscripciones", {
    method: "DELETE",
    body: JSON.stringify(datos),
  });
}
