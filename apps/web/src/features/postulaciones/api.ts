import type {
  ContactoVistaCliente,
  ContactoVistaProfesional,
  ContadorDiarioPostulaciones,
  CrearPlantillaMensaje,
  CrearPostulacion,
  GrupoEstadoPostulacion,
  PlantillaMensajeVista,
  PostulacionesPagina,
  PostulacionVistaCliente,
  PostulacionVistaProfesional,
  RegistrarPostulacionIniciada,
} from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

// --- PR-04: postularme, contador diario y plantillas de mensaje ---

export function crearPostulacion(input: CrearPostulacion): Promise<PostulacionVistaProfesional> {
  return fetchJson<PostulacionVistaProfesional>("/postulaciones", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * PR-04 (revision de codigo del slice 6): mide cuantos profesionales entran a
 * la pantalla de postularse aunque despues no envien el formulario
 * (`postulacion_enviada` lo registra el backend solo). Autenticado, a
 * diferencia de `registrarEvento` del asistente de pedido; se llama al montar
 * la pagina, sin esperar la respuesta ni bloquear la navegacion (ver el call
 * site: `.catch()`, nunca `await`).
 */
export function registrarPostulacionIniciada(input: RegistrarPostulacionIniciada): Promise<void> {
  return fetchJson<void>("/eventos/postulacion-iniciada", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export const contadorDiarioPostulacionesQueryKey = ["postulaciones", "contador-diario"] as const;

export function obtenerContadorDiarioPostulaciones(): Promise<ContadorDiarioPostulaciones> {
  return fetchJson<ContadorDiarioPostulaciones>("/postulaciones/contador-diario");
}

export const plantillasMensajeQueryKey = ["perfil-profesional", "plantillas"] as const;

export function obtenerPlantillasMensaje(): Promise<PlantillaMensajeVista[]> {
  return fetchJson<PlantillaMensajeVista[]>("/perfil-profesional/plantillas");
}

export function crearPlantillaMensaje(
  input: CrearPlantillaMensaje,
): Promise<PlantillaMensajeVista> {
  return fetchJson<PlantillaMensajeVista>("/perfil-profesional/plantillas", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function eliminarPlantillaMensaje(id: string): Promise<void> {
  return fetchJson<void>(`/perfil-profesional/plantillas/${id}`, { method: "DELETE" });
}

// --- PR-05: mis postulaciones (vista del profesional) ---

export function misPostulacionesQueryKey(
  grupo: GrupoEstadoPostulacion,
): readonly [string, GrupoEstadoPostulacion] {
  return ["postulaciones", grupo] as const;
}

export function obtenerMisPostulaciones(
  grupo: GrupoEstadoPostulacion,
  cursor?: string,
): Promise<PostulacionesPagina> {
  const params = new URLSearchParams({ grupo });
  if (cursor) params.set("cursor", cursor);
  return fetchJson<PostulacionesPagina>(`/postulaciones?${params.toString()}`);
}

export function retirarPostulacion(id: string): Promise<PostulacionVistaProfesional> {
  return fetchJson<PostulacionVistaProfesional>(`/postulaciones/${id}/retirar`, {
    method: "PATCH",
  });
}

// --- CL-08: postulaciones de un pedido, vista del cliente dueño ---

export function postulacionesDePedidoQueryKey(pedidoId: string): readonly [string, string, string] {
  return ["pedidos", pedidoId, "postulaciones"] as const;
}

export function obtenerPostulacionesDePedido(pedidoId: string): Promise<PostulacionVistaCliente[]> {
  return fetchJson<PostulacionVistaCliente[]>(`/pedidos/${pedidoId}/postulaciones`);
}

export function descartarPostulacion(id: string): Promise<PostulacionVistaCliente> {
  return fetchJson<PostulacionVistaCliente>(`/postulaciones/${id}/descartar`, {
    method: "PATCH",
  });
}

export function revertirDescartePostulacion(id: string): Promise<PostulacionVistaCliente> {
  return fetchJson<PostulacionVistaCliente>(`/postulaciones/${id}/revertir-descarte`, {
    method: "PATCH",
  });
}

export function seleccionarPostulacion(id: string): Promise<ContactoVistaCliente> {
  return fetchJson<ContactoVistaCliente>(`/postulaciones/${id}/seleccionar`, { method: "PATCH" });
}

// --- PR-06/CL-10: contacto habilitado tras la seleccion ---

export function noPuedoTomarloPostulacion(id: string): Promise<PostulacionVistaProfesional> {
  return fetchJson<PostulacionVistaProfesional>(`/postulaciones/${id}/no-puedo-tomarlo`, {
    method: "PATCH",
  });
}

export function contactoElegidoQueryKey(postulacionId: string): readonly [string, string, string] {
  return ["postulaciones", postulacionId, "elegido"] as const;
}

export function obtenerContactoElegido(postulacionId: string): Promise<ContactoVistaProfesional> {
  return fetchJson<ContactoVistaProfesional>(`/postulaciones/${postulacionId}/elegido`);
}

/**
 * PR-06/CL-10: registra que se abrio WhatsApp o se inicio una llamada desde
 * la pantalla de contacto. Se llama en el momento, sin esperar la respuesta
 * ni bloquear la navegacion del `tel:`/`wa.me` (call sites: siempre con
 * `.catch()`, nunca `await`, mismo criterio que `registrarEvento`).
 */
export function registrarEventoContacto(
  postulacionId: string,
  tipo: "whatsapp_abierto" | "llamada_iniciada",
): Promise<void> {
  return fetchJson<void>(`/postulaciones/${postulacionId}/evento-contacto`, {
    method: "POST",
    body: JSON.stringify({ tipo }),
  });
}
