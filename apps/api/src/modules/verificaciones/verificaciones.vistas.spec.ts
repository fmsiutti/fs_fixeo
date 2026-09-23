import { describe, expect, it } from "@jest/globals";
import { verificacionColaVistaSchema, verificacionVistaSchema } from "@fixeo/shared";
import type { VerificacionConRelaciones } from "./verificaciones.vistas.js";
import { mapearVerificacionAColaVista, mapearVerificacionAVista } from "./verificaciones.vistas.js";

function crearVerificacion(
  overrides: Partial<VerificacionConRelaciones> = {},
): VerificacionConRelaciones {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    perfilId: "22222222-2222-2222-2222-222222222222",
    tipo: "identidad",
    oficioId: null,
    documentos: ["verificaciones/22222222-2222-2222-2222-222222222222/1/0.jpg"],
    estado: "pendiente",
    revisadaPor: null,
    motivoRechazo: null,
    enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
    revisadaEn: null,
    perfil: {
      id: "22222222-2222-2222-2222-222222222222",
      usuarioId: "33333333-3333-3333-3333-333333333333",
      presentacion: null,
      aniosExperiencia: null,
      estadoVerificacion: "pendiente",
      verificadoEn: null,
      pausado: false,
      tasaRespuesta: null,
      promedioResenias: null,
      cantidadResenias: 0,
      trabajosCerrados: 0,
      creadoEn: new Date("2026-01-01T00:00:00.000Z"),
      usuario: {
        id: "33333333-3333-3333-3333-333333333333",
        telefono: "+541111111111",
        nombre: "Ana",
        apellido: "Gómez",
        email: null,
        fotoUrl: null,
        rolActivo: "profesional",
        estado: "activo",
        creadoEn: new Date("2026-01-01T00:00:00.000Z"),
        ultimoAcceso: null,
      },
    },
    oficio: null,
    ...overrides,
  } as VerificacionConRelaciones;
}

describe("mapearVerificacionAVista", () => {
  it("solo expone los campos de verificacionVistaSchema, nunca documentos ni revisadaPor", () => {
    const vista = mapearVerificacionAVista(crearVerificacion());

    expect(Object.keys(vista).sort()).toEqual(Object.keys(verificacionVistaSchema.shape).sort());
  });

  it("mapea las fechas a ISO string y deja revisadaEn en null si no se reviso", () => {
    const vista = mapearVerificacionAVista(crearVerificacion());

    expect(vista.enviadaEn).toBe("2026-01-01T00:00:00.000Z");
    expect(vista.revisadaEn).toBeNull();
  });
});

describe("mapearVerificacionAColaVista", () => {
  it("solo expone los campos de verificacionColaVistaSchema, nunca la key cruda de storage", () => {
    const vista = mapearVerificacionAColaVista(crearVerificacion(), ["https://firmada.example/1"]);

    expect(Object.keys(vista).sort()).toEqual(
      Object.keys(verificacionColaVistaSchema.shape).sort(),
    );
    expect(vista.documentos).toEqual(["https://firmada.example/1"]);
  });

  it("no expone el telefono del profesional en el perfil resumido", () => {
    const vista = mapearVerificacionAColaVista(crearVerificacion(), []);

    expect(vista.perfil).not.toHaveProperty("telefono");
    expect(vista.perfil).toEqual({
      id: "22222222-2222-2222-2222-222222222222",
      usuarioId: "33333333-3333-3333-3333-333333333333",
      nombre: "Ana",
      apellido: "Gómez",
    });
  });

  it("deja oficio en null cuando la verificacion es de identidad", () => {
    const vista = mapearVerificacionAColaVista(crearVerificacion({ oficio: null }), []);

    expect(vista.oficio).toBeNull();
  });

  it("mapea la categoria y los datos de matricula cuando la verificacion es de un oficio", () => {
    const vista = mapearVerificacionAColaVista(
      crearVerificacion({
        tipo: "matricula",
        oficio: {
          id: "44444444-4444-4444-4444-444444444444",
          perfilId: "22222222-2222-2222-2222-222222222222",
          categoriaId: "55555555-5555-5555-5555-555555555555",
          subcategorias: [],
          matriculaNumero: "12345",
          matriculaEnte: "ENARGAS",
          matriculaEstado: "pendiente",
          matriculaVenceEn: new Date("2027-01-01T00:00:00.000Z"),
          creadoEn: new Date("2026-01-01T00:00:00.000Z"),
          categoria: {
            id: "55555555-5555-5555-5555-555555555555",
            nombre: "Gas",
            slug: "gas",
            subcategorias: [],
            preguntasGuia: [],
            requiereMatricula: "obligatoria",
            activa: true,
          },
        },
      }),
      [],
    );

    expect(vista.oficio).toEqual({
      categoria: { id: "55555555-5555-5555-5555-555555555555", nombre: "Gas", slug: "gas" },
      matriculaNumero: "12345",
      matriculaEnte: "ENARGAS",
      matriculaVenceEn: "2027-01-01T00:00:00.000Z",
    });
  });
});
