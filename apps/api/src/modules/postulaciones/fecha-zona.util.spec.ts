import { describe, expect, it } from "@jest/globals";
import { inicioDelDiaEnZona, proximaMedianocheEnZona } from "./fecha-zona.util.js";

const ZONA = "America/Argentina/Buenos_Aires";

describe("inicioDelDiaEnZona", () => {
  it("devuelve las 03:00 UTC del mismo dia cuando ya paso la medianoche local (offset fijo -03:00)", () => {
    // 2026-01-15T14:00:00Z son las 11:00 del 15/01 en Buenos Aires.
    const ahora = new Date("2026-01-15T14:00:00.000Z");
    const inicio = inicioDelDiaEnZona(ahora, ZONA);
    expect(inicio.toISOString()).toBe("2026-01-15T03:00:00.000Z");
  });

  it("devuelve la medianoche del dia local anterior cuando UTC ya cruzo la medianoche pero AR todavia no", () => {
    // 2026-01-15T02:00:00Z son las 23:00 del 14/01 en Buenos Aires.
    const ahora = new Date("2026-01-15T02:00:00.000Z");
    const inicio = inicioDelDiaEnZona(ahora, ZONA);
    expect(inicio.toISOString()).toBe("2026-01-14T03:00:00.000Z");
  });
});

describe("proximaMedianocheEnZona", () => {
  it("es exactamente 24 h despues del inicio del dia actual (D7: offset fijo, sin horario de verano)", () => {
    const ahora = new Date("2026-01-15T14:00:00.000Z");
    const inicio = inicioDelDiaEnZona(ahora, ZONA);
    const proxima = proximaMedianocheEnZona(ahora, ZONA);
    expect(proxima.getTime() - inicio.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(proxima.toISOString()).toBe("2026-01-16T03:00:00.000Z");
  });
});
