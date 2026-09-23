import { describe, expect, it } from "vitest";
import { construirQueryFeed, hayFiltrosActivos, type FiltrosFeedTrabajos } from "./api";

describe("construirQueryFeed", () => {
  it("no agrega nada cuando no hay filtros ni cursor", () => {
    expect(construirQueryFeed({})).toBe("");
  });

  it("agrega categoriaId y urgencia cuando estan presentes", () => {
    const filtros: FiltrosFeedTrabajos = { categoriaId: "categoria-1", urgencia: "emergencia" };
    const query = new URLSearchParams(construirQueryFeed(filtros));
    expect(query.get("categoriaId")).toBe("categoria-1");
    expect(query.get("urgencia")).toBe("emergencia");
  });

  it("agrega distanciaMaxKm como numero", () => {
    const query = new URLSearchParams(construirQueryFeed({ distanciaMaxKm: 5 }));
    expect(query.get("distanciaMaxKm")).toBe("5");
  });

  it("agrega el cursor cuando se pasa", () => {
    const query = new URLSearchParams(construirQueryFeed({}, "cursor-1"));
    expect(query.get("cursor")).toBe("cursor-1");
  });

  // Los filtros booleanos son opt-in: un filtro desmarcado nunca tiene que
  // aparecer en la query string (ausente = no aplicar el filtro).
  it("nunca manda conFotos ni sinPostulaciones en false", () => {
    const query = construirQueryFeed({ conFotos: false, sinPostulaciones: false });
    expect(query).toBe("");
  });

  it("agrega conFotos y sinPostulaciones solo cuando son true", () => {
    const query = new URLSearchParams(
      construirQueryFeed({ conFotos: true, sinPostulaciones: true }),
    );
    expect(query.get("conFotos")).toBe("true");
    expect(query.get("sinPostulaciones")).toBe("true");
  });
});

describe("hayFiltrosActivos", () => {
  it("es false sin filtros", () => {
    expect(hayFiltrosActivos({})).toBe(false);
  });

  it("es false con booleanos en false", () => {
    expect(hayFiltrosActivos({ conFotos: false, sinPostulaciones: false })).toBe(false);
  });

  it("es true con al menos un filtro seteado", () => {
    expect(hayFiltrosActivos({ urgencia: "emergencia" })).toBe(true);
  });
});
