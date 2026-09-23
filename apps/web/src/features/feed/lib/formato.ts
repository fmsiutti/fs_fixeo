/** "a 2.3 km" para la tarjeta (PR-02) y el detalle (PR-03). Sin distancia si la zona es por barrios (distanciaKm null). */
export function formatearDistancia(distanciaKm: number): string {
  return `a ${distanciaKm.toFixed(1)} km`;
}

/** "1 lugar" / "N lugares", con el verbo concordado ("queda"/"quedan") para el aviso de D2. */
export function pluralizarLugares(cantidad: number): { sustantivo: string; verbo: string } {
  return cantidad === 1
    ? { sustantivo: "1 lugar", verbo: "queda" }
    : { sustantivo: `${cantidad} lugares`, verbo: "quedan" };
}
