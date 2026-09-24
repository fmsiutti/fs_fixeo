import type { EstimacionPostulacionInput } from "@fixeo/shared";

const formateadorPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** PR-04/PR-05/CL-08: "estimacion (rango o «a definir en la visita»)". */
export function formatearEstimacion(estimacion: EstimacionPostulacionInput): string {
  if (estimacion.aDefinir) return "A definir en la visita";
  return `${formateadorPesos.format(estimacion.minimo)} - ${formateadorPesos.format(estimacion.maximo)}`;
}

/** D7 (docs/dominio.md §12): hora local de renovacion del contador diario de PR-04. */
export function formatearHoraRenovacion(fechaIso: string): string {
  return new Date(fechaIso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * CL-08/CL-10: resumen de reputacion de un profesional ("★ 4.8 (12)" o "Nuevo
 * en Fixeo" sin reseñas). Compartido entre TarjetaPostulacionCliente y
 * ContactoPedidoPage: mismo shape de datos (promedio + cantidad), misma regla.
 */
export function resumenReputacion(profesional: {
  cantidadResenias: number;
  promedioResenias: number | null;
}): string {
  if (profesional.cantidadResenias === 0) return "Nuevo en Fixeo";
  const promedio = profesional.promedioResenias?.toFixed(1) ?? "—";
  return `★ ${promedio} (${profesional.cantidadResenias})`;
}

/** Nombre y apellido con fallback cuando ambos son null (perfil incompleto). */
export function nombreCompleto(
  persona: { nombre: string | null; apellido: string | null },
  fallback: string,
): string {
  return [persona.nombre, persona.apellido].filter(Boolean).join(" ") || fallback;
}
