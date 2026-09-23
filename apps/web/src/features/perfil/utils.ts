import type { VerificacionResumenVista } from "@fixeo/shared";

/**
 * Verificacion de identidad rechazada mas reciente (PR-01/PR-07). Solo existe
 * una via de identidad por perfil, pero puede haberse reenviado mas de una
 * vez tras un rechazo; se toma la ultima revisada.
 */
export function verificacionRechazadaMasReciente(
  verificaciones: VerificacionResumenVista[],
): VerificacionResumenVista | undefined {
  return [...verificaciones]
    .filter(
      (verificacion) => verificacion.tipo === "identidad" && verificacion.estado === "rechazada",
    )
    .sort((a, b) => (b.revisadaEn ?? "").localeCompare(a.revisadaEn ?? ""))[0];
}

/**
 * Verificacion de matricula rechazada de un oficio puntual (PR-01/PR-07):
 * `VerificacionResumenVista.oficioId` permite atribuir el motivo de rechazo
 * al oficio exacto, sin aproximar por fecha cuando hay 2+ oficios rechazados
 * a la vez.
 */
export function verificacionMatriculaRechazada(
  verificaciones: VerificacionResumenVista[],
  oficioId: string,
): VerificacionResumenVista | undefined {
  return [...verificaciones]
    .filter(
      (verificacion) =>
        verificacion.tipo === "matricula" &&
        verificacion.oficioId === oficioId &&
        verificacion.estado === "rechazada",
    )
    .sort((a, b) => (b.revisadaEn ?? "").localeCompare(a.revisadaEn ?? ""))[0];
}
