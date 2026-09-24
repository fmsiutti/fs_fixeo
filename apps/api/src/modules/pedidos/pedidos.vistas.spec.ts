import { describe, expect, it } from "@jest/globals";
import { pedidoResumenVistaSchema, pedidoVistaSchema } from "@fixeo/shared";
import type { PedidoConCategoriaResumen, PedidoConRelaciones } from "./pedidos.vistas.js";
import { mapearPedidoAResumenVista, mapearPedidoAVista } from "./pedidos.vistas.js";

function crearPedidoConRelaciones(
  overrides: Partial<PedidoConRelaciones> = {},
): PedidoConRelaciones {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    clienteId: "22222222-2222-2222-2222-222222222222",
    categoriaId: "33333333-3333-3333-3333-333333333333",
    subcategoria: null,
    descripcion: "Se rompio la canilla de la cocina y pierde agua todo el dia",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    direccionId: "44444444-4444-4444-4444-444444444444",
    barrioId: "55555555-5555-5555-5555-555555555555",
    lat: -34.6,
    lng: -58.4,
    estado: "publicado",
    publicadoEn: new Date("2026-01-01T00:00:00.000Z"),
    expiraEn: new Date("2026-01-08T00:00:00.000Z"),
    cierreAutomaticoEn: null,
    desenlacePostergado: false,
    desenlace: null,
    // Dato interno de moderacion: nunca deberia llegar a la vista del cliente.
    motivoModeracion: "revisar por las dudas",
    vistas: 3,
    cantidadPostulaciones: 1,
    cantidadContactos: 0,
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
    direccion: {
      id: "44444444-4444-4444-4444-444444444444",
      calle: "Av. Siempreviva",
      numero: "742",
      piso: null,
      depto: null,
      tipoPropiedad: "casa",
      barrioId: "55555555-5555-5555-5555-555555555555",
      lat: -34.6,
      lng: -58.4,
      creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    },
    barrio: {
      id: "55555555-5555-5555-5555-555555555555",
      nombre: "Palermo",
      activo: true,
    },
    fotos: [
      {
        id: "66666666-6666-6666-6666-666666666666",
        pedidoId: "11111111-1111-1111-1111-111111111111",
        url: "borradores/x/1.jpg",
        orden: 1,
        subidaEn: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "77777777-7777-7777-7777-777777777777",
        pedidoId: "11111111-1111-1111-1111-111111111111",
        url: "borradores/x/0.jpg",
        orden: 0,
        subidaEn: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    ...overrides,
  } as PedidoConRelaciones;
}

// Valores fijos y sencillos de chequear a mano en los tests que no ejercitan
// el calculo de cupo en si mismo (ver el describe de mas abajo para eso).
const DATOS_CUPO_NEUTROS = {
  postulacionesCupoLleno: false,
  cantidadContactos: 0,
  seleccionablesLibres: 3,
};

describe("mapearPedidoAVista", () => {
  it("solo expone los campos de pedidoVistaSchema, nunca clienteId, direccionId ni motivoModeracion", () => {
    const vista = mapearPedidoAVista(crearPedidoConRelaciones(), DATOS_CUPO_NEUTROS);

    expect(Object.keys(vista).sort()).toEqual(Object.keys(pedidoVistaSchema.shape).sort());
  });

  it("no expone campos internos de las relaciones anidadas (activa de categoria, barrioId de direccion, activo de barrio)", () => {
    const vista = mapearPedidoAVista(crearPedidoConRelaciones(), DATOS_CUPO_NEUTROS);

    expect(vista.categoria).not.toHaveProperty("activa");
    expect(vista.direccion).not.toHaveProperty("barrioId");
    expect(vista.barrio).not.toHaveProperty("activo");
  });

  it("ordena las fotos por orden ascendente, sin importar el orden en que llegaron", () => {
    const vista = mapearPedidoAVista(crearPedidoConRelaciones(), DATOS_CUPO_NEUTROS);

    expect(vista.fotos.map((foto) => foto.orden)).toEqual([0, 1]);
  });

  it("mapea los campos escalares 1 a 1 y las fechas a ISO string", () => {
    const pedido = crearPedidoConRelaciones();

    const vista = mapearPedidoAVista(pedido, DATOS_CUPO_NEUTROS);

    expect(vista).toMatchObject({
      id: pedido.id,
      subcategoria: pedido.subcategoria,
      descripcion: pedido.descripcion,
      urgencia: pedido.urgencia,
      estado: pedido.estado,
      vistas: pedido.vistas,
      cantidadPostulaciones: pedido.cantidadPostulaciones,
    });
    expect(vista.publicadoEn).toBe(pedido.publicadoEn?.toISOString());
    expect(vista.expiraEn).toBe(pedido.expiraEn?.toISOString());
    expect(vista.creadoEn).toBe(pedido.creadoEn.toISOString());
  });

  it("deja publicadoEn y expiraEn en null cuando el pedido todavia no se publico (D1: en_revision no tiene vigencia)", () => {
    const pedido = crearPedidoConRelaciones({
      estado: "en_revision",
      publicadoEn: null,
      expiraEn: null,
    });

    const vista = mapearPedidoAVista(pedido, DATOS_CUPO_NEUTROS);

    expect(vista.publicadoEn).toBeNull();
    expect(vista.expiraEn).toBeNull();
  });

  // CL-08 (revision de codigo del slice 6): estos 3 campos no se calculan aca
  // (ver pedidos.service.ts, que es quien conoce ParametrosService), pero la
  // vista tiene que trasladar sin tocar lo que le llega calculado.
  it("traslada los 3 campos de cupo tal cual los calculo el service", () => {
    const pedido = crearPedidoConRelaciones({ cantidadContactos: 2, cantidadPostulaciones: 8 });

    const vista = mapearPedidoAVista(pedido, {
      postulacionesCupoLleno: true,
      cantidadContactos: 2,
      seleccionablesLibres: 1,
    });

    expect(vista.postulacionesCupoLleno).toBe(true);
    expect(vista.cantidadContactos).toBe(2);
    expect(vista.seleccionablesLibres).toBe(1);
  });
});

describe("mapearPedidoAResumenVista", () => {
  function crearPedidoConCategoriaResumen(
    overrides: Partial<PedidoConCategoriaResumen> = {},
  ): PedidoConCategoriaResumen {
    return {
      ...crearPedidoConRelaciones(),
      categoria: { nombre: "Plomería", slug: "plomeria" },
      ...overrides,
    } as PedidoConCategoriaResumen;
  }

  it("solo expone los campos de pedidoResumenVistaSchema", () => {
    const vista = mapearPedidoAResumenVista(crearPedidoConCategoriaResumen());

    expect(Object.keys(vista).sort()).toEqual(Object.keys(pedidoResumenVistaSchema.shape).sort());
  });

  it("trunca la descripcion mas alla de 140 caracteres, agregando puntos suspensivos", () => {
    const descripcionLarga = "a".repeat(200);

    const vista = mapearPedidoAResumenVista(
      crearPedidoConCategoriaResumen({ descripcion: descripcionLarga }),
    );

    expect(vista.descripcion.length).toBe(141); // 140 + "…"
    expect(vista.descripcion.endsWith("…")).toBe(true);
  });

  it("no toca una descripcion mas corta que el limite", () => {
    const vista = mapearPedidoAResumenVista(
      crearPedidoConCategoriaResumen({ descripcion: "Descripcion corta" }),
    );

    expect(vista.descripcion).toBe("Descripcion corta");
  });
});
