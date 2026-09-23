const MINUTO_EN_MS = 60_000;
const HORA_EN_MS = 60 * MINUTO_EN_MS;
const DIA_EN_MS = 24 * HORA_EN_MS;
const MES_EN_MS = 30 * DIA_EN_MS;

/**
 * Antigüedad en español rioplatense ("hace 3 días") para tarjetas y detalle
 * de pedido. No hay una librería de fechas en el repo (CLAUDE.md: no agregar
 * dependencias sin preguntar), así que esta es la única utilidad chica que
 * hace falta para PR-02/PR-03.
 */
export function formatearAntiguedad(fechaIso: string, ahora: Date = new Date()): string {
  const diffMs = ahora.getTime() - new Date(fechaIso).getTime();
  if (diffMs < MINUTO_EN_MS) return "Recién";

  if (diffMs < HORA_EN_MS) {
    const minutos = Math.floor(diffMs / MINUTO_EN_MS);
    return `hace ${minutos} min`;
  }

  if (diffMs < DIA_EN_MS) {
    const horas = Math.floor(diffMs / HORA_EN_MS);
    return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  }

  if (diffMs < MES_EN_MS) {
    const dias = Math.floor(diffMs / DIA_EN_MS);
    return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  }

  const meses = Math.floor(diffMs / MES_EN_MS);
  return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
}
