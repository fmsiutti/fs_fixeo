import { describe, expect, it } from "@jest/globals";
import { reseniaVistaSchema } from "@fixeo/shared";
import type { ReseniaConRelaciones } from "./resenias.vistas.js";
import { mapearReseniaAVista } from "./resenias.vistas.js";

function crearReseniaConRelaciones(
  overrides: Partial<ReseniaConRelaciones> = {},
): ReseniaConRelaciones {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    pedidoId: "22222222-2222-2222-2222-222222222222",
    contactoId: "33333333-3333-3333-3333-333333333333",
    profesionalId: "44444444-4444-4444-4444-444444444444",
    clienteId: "55555555-5555-5555-5555-555555555555",
    puntaje: 5,
    atributos: ["puntual", "prolijo"],
    comentario: "Excelente trabajo, muy recomendable",
    // docs/dominio.md §8: privado, nunca se expone. Un valor "sospechoso" a
    // proposito para que un JSON.stringify lo delate si se filtra.
    montoDeclarado: 987654,
    respuestaProfesional: null,
    publicadaEn: new Date("2026-01-10T00:00:00.000Z"),
    cliente: { nombre: "María", apellido: "Gómez" },
    pedido: {
      categoria: { nombre: "Plomería", slug: "plomeria" },
    },
    ...overrides,
  } as ReseniaConRelaciones;
}

describe("mapearReseniaAVista", () => {
  it("solo expone los campos de reseniaVistaSchema", () => {
    const vista = mapearReseniaAVista(crearReseniaConRelaciones());

    expect(Object.keys(vista).sort()).toEqual(Object.keys(reseniaVistaSchema.shape).sort());
  });

  it("nunca expone montoDeclarado (docs/dominio.md §8: privado, solo rangos de referencia)", () => {
    const vista = mapearReseniaAVista(crearReseniaConRelaciones());

    expect(vista).not.toHaveProperty("montoDeclarado");
    expect(JSON.stringify(vista)).not.toContain("987654");
  });

  it("nunca expone ids crudos de Prisma (pedidoId, contactoId, profesionalId, clienteId)", () => {
    const vista = mapearReseniaAVista(crearReseniaConRelaciones());

    expect(vista).not.toHaveProperty("pedidoId");
    expect(vista).not.toHaveProperty("contactoId");
    expect(vista).not.toHaveProperty("profesionalId");
    expect(vista).not.toHaveProperty("clienteId");
  });

  it("expone solo el nombre de pila y la inicial del apellido del cliente, nunca el apellido completo", () => {
    const vista = mapearReseniaAVista(crearReseniaConRelaciones());

    expect(vista.cliente.nombre).toBe("María");
    expect(vista.cliente.inicialApellido).toBe("G.");
    expect(JSON.stringify(vista)).not.toContain("Gómez");
  });

  it("inicialApellido es null cuando el cliente no tiene apellido cargado", () => {
    const vista = mapearReseniaAVista(
      crearReseniaConRelaciones({ cliente: { nombre: "María", apellido: null } }),
    );

    expect(vista.cliente.inicialApellido).toBeNull();
  });

  it("expone la categoria del pedido (nombre y slug) y la fecha de publicacion", () => {
    const vista = mapearReseniaAVista(crearReseniaConRelaciones());

    expect(vista.categoria).toEqual({ nombre: "Plomería", slug: "plomeria" });
    expect(vista.publicadaEn).toBe("2026-01-10T00:00:00.000Z");
  });
});
