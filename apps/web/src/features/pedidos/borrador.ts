import { useCallback, useState } from "react";
import type { DireccionInput, Franja, Urgencia } from "@fixeo/shared";

const CLAVE_STORAGE = "fixeo:borrador-pedido";

/**
 * A diferencia de `FotoPedidoInput` (el contrato de `POST /pedidos`, que a
 * proposito solo lleva `id` — la url la recalcula el backend, ver
 * packages/shared/src/pedidos.ts), el borrador local SI necesita la url:
 * es lo unico que le permite mostrar la preview de la foto sin volver a
 * pedirle nada al backend al recargar la pagina. Se recorta a `{id}` recien
 * al armar el payload de publicar (RevisarPage).
 */
export interface FotoBorrador {
  id: string;
  url: string;
}

/**
 * Borrador del asistente de publicacion (CL-02 a CL-06). Vive enteramente en
 * el dispositivo: no hay endpoint de guardado incremental (las FK de Pedido
 * son obligatorias, guardar un borrador a medias del lado del servidor es
 * mas de lo que este slice necesita). Sirve igual para anonimos y logueados.
 */
export interface BorradorPedido {
  borradorId: string;
  queNecesitas: string;
  categoriaId: string | null;
  descripcion: string;
  respuestasGuia: Record<string, string>;
  fotos: FotoBorrador[];
  direccion: DireccionInput | null;
  urgencia: Urgencia | null;
  franjas: Franja[];
}

function crearBorradorVacio(): BorradorPedido {
  return {
    borradorId: crypto.randomUUID(),
    queNecesitas: "",
    categoriaId: null,
    descripcion: "",
    respuestasGuia: {},
    fotos: [],
    direccion: null,
    urgencia: null,
    franjas: [],
  };
}

function leerBorradorGuardado(): BorradorPedido | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_STORAGE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as Partial<BorradorPedido>;
    if (typeof datos.borradorId !== "string") return null;
    return { ...crearBorradorVacio(), ...datos };
  } catch {
    return null;
  }
}

function guardarBorrador(borrador: BorradorPedido): void {
  try {
    window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(borrador));
  } catch {
    // Almacenamiento lleno o deshabilitado (modo privado): el asistente sigue
    // funcionando en memoria para la sesion actual, solo no persiste entre visitas.
  }
}

function limpiarBorradorGuardado(): void {
  try {
    window.localStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // Nada que limpiar si el storage ya fallaba.
  }
}

/** Lectura de solo consulta, para CL-01 ("Seguí donde dejaste") sin necesidad del hook completo. */
export function hayBorradorEnProgreso(): boolean {
  const borrador = leerBorradorGuardado();
  return borrador !== null && borrador.categoriaId !== null;
}

/** Estado del asistente respaldado en localStorage. Cada `actualizar` persiste de inmediato. */
export function useBorradorPedido(): {
  borrador: BorradorPedido;
  actualizar: (cambios: Partial<BorradorPedido>) => void;
  limpiar: () => void;
} {
  const [borrador, setBorrador] = useState<BorradorPedido>(() => {
    const existente = leerBorradorGuardado();
    if (existente) return existente;
    const nuevo = crearBorradorVacio();
    guardarBorrador(nuevo);
    return nuevo;
  });

  const actualizar = useCallback((cambios: Partial<BorradorPedido>) => {
    setBorrador((actual) => {
      const siguiente = { ...actual, ...cambios };
      guardarBorrador(siguiente);
      return siguiente;
    });
  }, []);

  const limpiar = useCallback(() => {
    limpiarBorradorGuardado();
    setBorrador(crearBorradorVacio());
  }, []);

  return { borrador, actualizar, limpiar };
}
