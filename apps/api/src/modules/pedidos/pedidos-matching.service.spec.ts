import { describe, expect, it } from "@jest/globals";
import { aplicarCuotaRotacion, type CandidatoMatching } from "./pedidos-matching.service.js";

function candidato(overrides: Partial<CandidatoMatching> = {}): CandidatoMatching {
  return {
    usuarioId: "usuario-1",
    cantidadResenias: 0,
    promedioResenias: null,
    tasaRespuesta: null,
    distanciaKm: null,
    ...overrides,
  };
}

// docs/dominio.md §6 y D6 (§12): 20% de 30 = 6 cupos para perfiles nuevos
// (menos de 5 resenias), ordenados por cercania; el resto por un puntaje
// combinado. Los parametros de estos tests replican los valores sembrados.
const PARAMETROS = { notificadosIniciales: 30, cuotaPct: 20, umbralResenias: 5 };

describe("aplicarCuotaRotacion", () => {
  it("nunca devuelve mas de notificadosIniciales candidatos", () => {
    const candidatos = Array.from({ length: 50 }, (_, indice) =>
      candidato({ usuarioId: `usuario-${indice}`, cantidadResenias: indice }),
    );

    const resultado = aplicarCuotaRotacion(candidatos, PARAMETROS);

    expect(resultado.length).toBeLessThanOrEqual(PARAMETROS.notificadosIniciales);
    expect(new Set(resultado).size).toBe(resultado.length);
  });

  it("reserva el cupo de rotacion (6 de 30) a los perfiles nuevos mas cercanos", () => {
    const nuevosLejanos = Array.from({ length: 10 }, (_, indice) =>
      candidato({
        usuarioId: `nuevo-lejano-${indice}`,
        cantidadResenias: 0,
        distanciaKm: 50 + indice,
      }),
    );
    const nuevosCercanos = Array.from({ length: 3 }, (_, indice) =>
      candidato({ usuarioId: `nuevo-cercano-${indice}`, cantidadResenias: 0, distanciaKm: indice }),
    );
    const generales = Array.from({ length: 30 }, (_, indice) =>
      candidato({
        usuarioId: `general-${indice}`,
        cantidadResenias: 10,
        promedioResenias: 4.5,
        distanciaKm: 1,
      }),
    );

    const resultado = aplicarCuotaRotacion(
      [...nuevosLejanos, ...nuevosCercanos, ...generales],
      PARAMETROS,
    );

    // Los 3 nuevos mas cercanos entran seguro (cupo de 6, cubierto por los
    // mas cercanos primero); los nuevos lejanos no desplazan a los cercanos.
    for (const nuevo of nuevosCercanos) {
      expect(resultado).toContain(nuevo.usuarioId);
    }
  });

  it("si no alcanzan los perfiles nuevos, los cupos sobrantes van al grupo general (nunca se avisa a menos)", () => {
    const unSoloNuevo = candidato({ usuarioId: "nuevo-1", cantidadResenias: 0, distanciaKm: 1 });
    const generales = Array.from({ length: 40 }, (_, indice) =>
      candidato({
        usuarioId: `general-${indice}`,
        cantidadResenias: 10,
        promedioResenias: 4,
        tasaRespuesta: 0.8,
        distanciaKm: indice,
      }),
    );

    const resultado = aplicarCuotaRotacion([unSoloNuevo, ...generales], PARAMETROS);

    expect(resultado).toHaveLength(PARAMETROS.notificadosIniciales);
    expect(resultado).toContain(unSoloNuevo.usuarioId);
  });

  it("dentro del grupo general, prioriza cercania, resenias y tasa de respuesta combinadas", () => {
    const mejor = candidato({
      usuarioId: "mejor",
      cantidadResenias: 10,
      distanciaKm: 0,
      promedioResenias: 5,
      tasaRespuesta: 1,
    });
    const peor = candidato({
      usuarioId: "peor",
      cantidadResenias: 10,
      distanciaKm: 100,
      promedioResenias: 1,
      tasaRespuesta: 0,
    });

    const resultado = aplicarCuotaRotacion([peor, mejor], {
      notificadosIniciales: 1,
      cuotaPct: 20,
      umbralResenias: 5,
    });

    expect(resultado).toEqual(["mejor"]);
  });

  it("trata distanciaKm null (zona por barrios) como la coincidencia mas cercana posible", () => {
    const porBarrio = candidato({
      usuarioId: "por-barrio",
      cantidadResenias: 0,
      distanciaKm: null,
    });
    const porRadioCercano = candidato({
      usuarioId: "por-radio",
      cantidadResenias: 0,
      distanciaKm: 0.001,
    });

    const resultado = aplicarCuotaRotacion([porRadioCercano, porBarrio], {
      notificadosIniciales: 1,
      cuotaPct: 100,
      umbralResenias: 5,
    });

    expect(resultado).toEqual(["por-barrio"]);
  });
});
