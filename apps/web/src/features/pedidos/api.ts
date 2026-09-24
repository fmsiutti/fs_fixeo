import type {
  BarrioVista,
  CategoriaVista,
  ContactoVistaCliente,
  CrearPedido,
  EditarPedido,
  PedidoResumenVista,
  PedidoVista,
  RegistrarEvento,
} from "@fixeo/shared";
import { fetchJson } from "../../lib/http";

export const categoriasQueryKey = ["categorias"] as const;

export function obtenerCategorias(): Promise<CategoriaVista[]> {
  return fetchJson<CategoriaVista[]>("/categorias");
}

export const barriosQueryKey = ["barrios"] as const;

export function obtenerBarrios(): Promise<BarrioVista[]> {
  return fetchJson<BarrioVista[]>("/barrios");
}

export const misPedidosQueryKey = ["pedidos", "mios"] as const;

export function obtenerMisPedidos(): Promise<PedidoResumenVista[]> {
  return fetchJson<PedidoResumenVista[]>("/pedidos");
}

export function pedidoQueryKey(id: string): readonly ["pedidos", string] {
  return ["pedidos", id] as const;
}

export function obtenerPedido(id: string): Promise<PedidoVista> {
  return fetchJson<PedidoVista>(`/pedidos/${id}`);
}

export function crearPedido(input: CrearPedido): Promise<PedidoVista> {
  return fetchJson<PedidoVista>("/pedidos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelarPedido(id: string): Promise<PedidoVista> {
  return fetchJson<PedidoVista>(`/pedidos/${id}/cancelar`, { method: "PATCH" });
}

export function editarPedido(id: string, input: EditarPedido): Promise<PedidoVista> {
  return fetchJson<PedidoVista>(`/pedidos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// --- CL-10: contacto habilitado, hasta 3 bloques (uno por elegido) ---

export function contactoDelPedidoQueryKey(pedidoId: string): readonly [string, string, string] {
  return ["pedidos", pedidoId, "contacto"] as const;
}

export function obtenerContactoDelPedido(pedidoId: string): Promise<ContactoVistaCliente[]> {
  return fetchJson<ContactoVistaCliente[]>(`/pedidos/${pedidoId}/contacto`);
}

export interface FotoBorradorSubida {
  id: string;
  url: string;
}

export function subirFotoBorrador(params: {
  borradorId: string;
  archivo: File;
}): Promise<FotoBorradorSubida> {
  const formData = new FormData();
  formData.append("foto", params.archivo);
  formData.append("borradorId", params.borradorId);
  return fetchJson<FotoBorradorSubida>("/pedidos/borrador/fotos", {
    method: "POST",
    body: formData,
  });
}

export function eliminarFotoBorrador(params: { id: string; borradorId: string }): Promise<void> {
  const query = new URLSearchParams({ borradorId: params.borradorId });
  return fetchJson<void>(`/pedidos/borrador/fotos/${params.id}?${query.toString()}`, {
    method: "DELETE",
  });
}

/**
 * docs/dominio.md §10: mide el embudo del asistente. Publico y sin sesion
 * (igual que la subida de fotos): el asistente arranca antes de que exista
 * cuenta. Se llama "en el momento", sin esperar la respuesta ni bloquear la
 * navegacion (ver los call sites: siempre con `.catch()`, nunca `await`).
 */
export function registrarEvento(input: RegistrarEvento): Promise<void> {
  return fetchJson<void>("/eventos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
