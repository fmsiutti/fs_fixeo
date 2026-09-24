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
