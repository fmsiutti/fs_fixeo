const PREFIJO_STORAGE = "fixeo:borrador-postulacion:";

/**
 * PR-04: "No perder el texto si falla". El mensaje se respalda por pedido en
 * sessionStorage (sobrevive a un refresh accidental, a diferencia de
 * features/pedidos/borrador.ts que usa localStorage porque el asistente de
 * publicacion es multi-paso y mas largo). Mismo patron try/catch: el
 * almacenamiento puede fallar (modo privado, cuota llena) sin romper el flujo.
 */
export function leerBorradorMensaje(pedidoId: string): string {
  try {
    return window.sessionStorage.getItem(`${PREFIJO_STORAGE}${pedidoId}`) ?? "";
  } catch {
    return "";
  }
}

export function guardarBorradorMensaje(pedidoId: string, mensaje: string): void {
  try {
    window.sessionStorage.setItem(`${PREFIJO_STORAGE}${pedidoId}`, mensaje);
  } catch {
    // Almacenamiento lleno o deshabilitado: la postulacion sigue funcionando en memoria.
  }
}

export function limpiarBorradorMensaje(pedidoId: string): void {
  try {
    window.sessionStorage.removeItem(`${PREFIJO_STORAGE}${pedidoId}`);
  } catch {
    // Nada que limpiar si el storage ya fallaba.
  }
}
