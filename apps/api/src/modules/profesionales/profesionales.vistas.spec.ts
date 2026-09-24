import { describe, expect, it } from "@jest/globals";
import { perfilProfesionalVistaPropiaSchema } from "@fixeo/shared";
import type { Verificacion } from "../../generated/prisma/client.js";
import type {
  OficioConCategoria,
  PerfilConRelaciones,
  PerfilConRelacionesPublicas,
} from "./profesionales.vistas.js";
import { mapearPerfilAVistaPropia, mapearPerfilAVistaPublica } from "./profesionales.vistas.js";

function crearVerificacion(overrides: Partial<Verificacion> = {}): Verificacion {
  return {
    id: "77777777-7777-7777-7777-777777777777",
    perfilId: "22222222-2222-2222-2222-222222222222",
    tipo: "identidad",
    oficioId: null,
    documentos: ["verificaciones/22222222-2222-2222-2222-222222222222/1/0.jpg"],
    estado: "rechazada",
    revisadaPor: "88888888-8888-8888-8888-888888888888",
    motivoRechazo: "foto_ilegible",
    enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
    revisadaEn: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as Verificacion;
}

function crearOficio(overrides: Partial<OficioConCategoria> = {}): OficioConCategoria {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    perfilId: "22222222-2222-2222-2222-222222222222",
    categoriaId: "33333333-3333-3333-3333-333333333333",
    subcategorias: ["Destapaciones"],
    matriculaNumero: null,
    matriculaEnte: null,
    matriculaEstado: "no_requerida",
    matriculaVenceEn: null,
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    categoria: {
      id: "33333333-3333-3333-3333-333333333333",
      nombre: "Plomería",
      slug: "plomeria",
      subcategorias: [],
      preguntasGuia: [],
      requiereMatricula: "no_exigida",
      activa: true,
    },
    ...overrides,
  } as OficioConCategoria;
}

function crearPerfil(overrides: Partial<PerfilConRelaciones> = {}): PerfilConRelaciones {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    usuarioId: "44444444-4444-4444-4444-444444444444",
    presentacion: "Plomero con 10 años de experiencia",
    aniosExperiencia: 10,
    estadoVerificacion: "pendiente",
    verificadoEn: null,
    pausado: false,
    tasaRespuesta: null,
    promedioResenias: null,
    cantidadResenias: 0,
    trabajosCerrados: 0,
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    oficios: [crearOficio()],
    zonaCobertura: null,
    verificaciones: [],
    ...overrides,
  } as PerfilConRelaciones;
}

describe("mapearPerfilAVistaPropia", () => {
  it("solo expone los campos de perfilProfesionalVistaPropiaSchema, nunca usuarioId", () => {
    const vista = mapearPerfilAVistaPropia(crearPerfil());

    expect(Object.keys(vista).sort()).toEqual(
      Object.keys(perfilProfesionalVistaPropiaSchema.shape).sort(),
    );
  });

  it("mapea el estado de matricula de cada oficio y su categoria", () => {
    const vista = mapearPerfilAVistaPropia(
      crearPerfil({
        oficios: [crearOficio({ matriculaEstado: "pendiente" })],
      }),
    );

    expect(vista.oficios).toHaveLength(1);
    expect(vista.oficios[0]).toMatchObject({
      matriculaEstado: "pendiente",
      categoria: { slug: "plomeria" },
    });
  });

  it("deja zonaCobertura en null cuando el perfil todavia no la configuro", () => {
    const vista = mapearPerfilAVistaPropia(crearPerfil({ zonaCobertura: null }));

    expect(vista.zonaCobertura).toBeNull();
  });

  it("mapea zona por barrios sin exponer los campos de radio", () => {
    const vista = mapearPerfilAVistaPropia(
      crearPerfil({
        zonaCobertura: {
          id: "55555555-5555-5555-5555-555555555555",
          perfilId: "22222222-2222-2222-2222-222222222222",
          tipo: "barrios",
          barrioIds: ["66666666-6666-6666-6666-666666666666"],
          centroLat: null,
          centroLng: null,
          radioKm: null,
          actualizadoEn: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );

    expect(vista.zonaCobertura).toEqual({
      tipo: "barrios",
      barrioIds: ["66666666-6666-6666-6666-666666666666"],
    });
  });

  it("mapea las verificaciones del perfil, incluido el motivo de rechazo", () => {
    const vista = mapearPerfilAVistaPropia(crearPerfil({ verificaciones: [crearVerificacion()] }));

    expect(vista.verificaciones).toEqual([
      {
        id: "77777777-7777-7777-7777-777777777777",
        tipo: "identidad",
        oficioId: null,
        estado: "rechazada",
        motivoRechazo: "foto_ilegible",
        revisadaEn: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("mapea el oficioId de una verificacion de matricula, para atribuir el rechazo al oficio correcto", () => {
    const vista = mapearPerfilAVistaPropia(
      crearPerfil({
        verificaciones: [
          crearVerificacion({
            tipo: "matricula",
            oficioId: "11111111-1111-1111-1111-111111111111",
          }),
        ],
      }),
    );

    expect(vista.verificaciones[0]?.oficioId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("mapea zona por radio con sus tres campos numericos", () => {
    const vista = mapearPerfilAVistaPropia(
      crearPerfil({
        zonaCobertura: {
          id: "55555555-5555-5555-5555-555555555555",
          perfilId: "22222222-2222-2222-2222-222222222222",
          tipo: "radio",
          barrioIds: [],
          centroLat: -34.6,
          centroLng: -58.4,
          radioKm: 5,
          actualizadoEn: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );

    expect(vista.zonaCobertura).toEqual({
      tipo: "radio",
      centroLat: -34.6,
      centroLng: -58.4,
      radioKm: 5,
    });
  });
});

function crearPerfilPublico(
  overrides: Partial<PerfilConRelacionesPublicas> = {},
): PerfilConRelacionesPublicas {
  return {
    ...crearPerfil(),
    usuario: { nombre: "Juan", apellido: "Pérez", fotoUrl: null },
    ...overrides,
  } as PerfilConRelacionesPublicas;
}

describe("mapearPerfilAVistaPublica", () => {
  // CL-09 (revision de codigo del slice 6, hallazgo 9): a diferencia de
  // mapearPerfilAVistaPropia, la zona por radio de la vista publica nunca
  // expone las coordenadas exactas del profesional, solo el radio en km.
  it("mapea zona por radio sin centroLat ni centroLng", () => {
    const vista = mapearPerfilAVistaPublica(
      crearPerfilPublico({
        zonaCobertura: {
          id: "55555555-5555-5555-5555-555555555555",
          perfilId: "22222222-2222-2222-2222-222222222222",
          tipo: "radio",
          barrioIds: [],
          centroLat: -34.6,
          centroLng: -58.4,
          radioKm: 5,
          actualizadoEn: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );

    expect(vista.zonaCobertura).toEqual({ tipo: "radio", radioKm: 5 });
    expect(vista.zonaCobertura).not.toHaveProperty("centroLat");
    expect(vista.zonaCobertura).not.toHaveProperty("centroLng");
  });

  it("mapea zona por barrios igual que la vista propia", () => {
    const vista = mapearPerfilAVistaPublica(
      crearPerfilPublico({
        zonaCobertura: {
          id: "55555555-5555-5555-5555-555555555555",
          perfilId: "22222222-2222-2222-2222-222222222222",
          tipo: "barrios",
          barrioIds: ["66666666-6666-6666-6666-666666666666"],
          centroLat: null,
          centroLng: null,
          radioKm: null,
          actualizadoEn: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );

    expect(vista.zonaCobertura).toEqual({
      tipo: "barrios",
      barrioIds: ["66666666-6666-6666-6666-666666666666"],
    });
  });

  it("nunca expone usuarioId ni telefono", () => {
    const vista = mapearPerfilAVistaPublica(crearPerfilPublico());

    expect(vista).not.toHaveProperty("usuarioId");
    expect(JSON.stringify(vista)).not.toContain("telefono");
  });
});
