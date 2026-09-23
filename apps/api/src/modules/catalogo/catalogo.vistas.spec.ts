import { describe, expect, it } from "@jest/globals";
import type { Barrio, Categoria } from "../../generated/prisma/client.js";
import { mapearBarrioAVista, mapearCategoriaAVista } from "./catalogo.vistas.js";

function crearCategoria(overrides: Partial<Categoria> = {}): Categoria {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    nombre: "Gas",
    slug: "gas",
    subcategorias: ["Instalacion", "Reparacion"],
    preguntasGuia: ["¿Que tipo de artefacto?"],
    requiereMatricula: "obligatoria",
    activa: true,
    ...overrides,
  } as Categoria;
}

function crearBarrio(overrides: Partial<Barrio> = {}): Barrio {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    nombre: "Palermo",
    activo: true,
    ...overrides,
  } as Barrio;
}

describe("mapearCategoriaAVista", () => {
  it("nunca expone el campo activa, aunque la entidad lo tenga", () => {
    const vista = mapearCategoriaAVista(crearCategoria());

    expect(vista).not.toHaveProperty("activa");
  });

  it("mapea los campos esperados 1 a 1", () => {
    const categoria = crearCategoria();

    const vista = mapearCategoriaAVista(categoria);

    expect(vista).toEqual({
      id: categoria.id,
      nombre: categoria.nombre,
      slug: categoria.slug,
      subcategorias: categoria.subcategorias,
      preguntasGuia: categoria.preguntasGuia,
      requiereMatricula: categoria.requiereMatricula,
    });
  });
});

describe("mapearBarrioAVista", () => {
  it("nunca expone el campo activo, aunque la entidad lo tenga", () => {
    const vista = mapearBarrioAVista(crearBarrio());

    expect(vista).not.toHaveProperty("activo");
  });

  it("mapea los campos esperados 1 a 1", () => {
    const barrio = crearBarrio();

    const vista = mapearBarrioAVista(barrio);

    expect(vista).toEqual({
      id: barrio.id,
      nombre: barrio.nombre,
    });
  });
});
