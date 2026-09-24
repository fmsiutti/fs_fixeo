import { describe, expect, it } from "@jest/globals";
import { contactoVistaClienteSchema, contactoVistaProfesionalSchema } from "@fixeo/shared";
import type { ContactoConPedidoYCliente, ContactoConProfesional } from "./contactos.vistas.js";
import {
  mapearContactoAVistaCliente,
  mapearContactoAVistaProfesional,
} from "./contactos.vistas.js";

function crearContactoConProfesional(
  overrides: Partial<ContactoConProfesional> = {},
): ContactoConProfesional {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    pedidoId: "22222222-2222-2222-2222-222222222222",
    postulacionId: "33333333-3333-3333-3333-333333333333",
    orden: 1,
    habilitadoEn: new Date("2026-01-01T00:00:00.000Z"),
    abiertoWhatsappEn: null,
    confirmadoPorCliente: false,
    postulacion: {
      id: "33333333-3333-3333-3333-333333333333",
      pedidoId: "22222222-2222-2222-2222-222222222222",
      profesionalId: "44444444-4444-4444-4444-444444444444",
      mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
      estimacionADefinir: true,
      estimacionMin: null,
      estimacionMax: null,
      disponibilidad: null,
      estado: "seleccionada",
      enviadaEn: new Date("2025-12-30T00:00:00.000Z"),
      vistaEn: new Date("2025-12-30T01:00:00.000Z"),
      descartadaEn: null,
      profesional: {
        id: "44444444-4444-4444-4444-444444444444",
        usuarioId: "55555555-5555-5555-5555-555555555555",
        presentacion: "Plomero de toda la vida",
        aniosExperiencia: 10,
        estadoVerificacion: "aprobada",
        verificadoEn: new Date("2025-01-01T00:00:00.000Z"),
        pausado: false,
        tasaRespuesta: 0.9,
        promedioResenias: 4.5,
        cantidadResenias: 12,
        trabajosCerrados: 8,
        creadoEn: new Date("2025-01-01T00:00:00.000Z"),
        usuario: {
          nombre: "Juan",
          apellido: "Pérez",
          fotoUrl: "fotos/juan.jpg",
          // docs/dominio.md §7: "Telefono del profesional | Oculto | Visible
          // para el cliente" — este mapeo solo se llama sobre Contactos ya
          // creados, asi que este dato viaja completo.
          telefono: "+5491100000001",
        },
      },
    },
    ...overrides,
  } as ContactoConProfesional;
}

describe("mapearContactoAVistaCliente", () => {
  it("solo expone los campos de contactoVistaClienteSchema", () => {
    const vista = mapearContactoAVistaCliente(crearContactoConProfesional());

    expect(Object.keys(vista).sort()).toEqual(Object.keys(contactoVistaClienteSchema.shape).sort());
  });

  it("expone el telefono del profesional (docs/dominio.md §7: visible para el cliente que lo elige)", () => {
    const vista = mapearContactoAVistaCliente(crearContactoConProfesional());

    expect(vista.profesional.telefono).toBe("+5491100000001");
  });

  it("no expone ningun dato del cliente: esta vista es solo sobre el profesional elegido", () => {
    const vista = mapearContactoAVistaCliente(crearContactoConProfesional());

    expect(JSON.stringify(vista)).not.toMatch(/cliente/i);
  });

  it("mapea la estimacion 'a definir' cuando estimacionADefinir es true", () => {
    const vista = mapearContactoAVistaCliente(
      crearContactoConProfesional({
        postulacion: {
          ...crearContactoConProfesional().postulacion,
          estimacionADefinir: true,
          estimacionMin: null,
          estimacionMax: null,
        },
      }),
    );

    expect(vista.estimacion).toEqual({ aDefinir: true });
  });

  it("mapea la estimacion con rango cuando estimacionADefinir es false", () => {
    const vista = mapearContactoAVistaCliente(
      crearContactoConProfesional({
        postulacion: {
          ...crearContactoConProfesional().postulacion,
          estimacionADefinir: false,
          estimacionMin: 10000,
          estimacionMax: 20000,
        },
      }),
    );

    expect(vista.estimacion).toEqual({ aDefinir: false, minimo: 10000, maximo: 20000 });
  });

  it("mapea escalares (orden, mensaje, estadoPostulacion) y la fecha a ISO string", () => {
    const contacto = crearContactoConProfesional({ orden: 2 });

    const vista = mapearContactoAVistaCliente(contacto);

    expect(vista.orden).toBe(2);
    expect(vista.postulacionId).toBe(contacto.postulacionId);
    expect(vista.mensaje).toBe(contacto.postulacion.mensaje);
    expect(vista.estadoPostulacion).toBe(contacto.postulacion.estado);
    expect(vista.habilitadoEn).toBe(contacto.habilitadoEn.toISOString());
  });
});

function crearContactoConPedidoYCliente(
  overrides: Partial<ContactoConPedidoYCliente> = {},
): ContactoConPedidoYCliente {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    pedidoId: "22222222-2222-2222-2222-222222222222",
    postulacionId: "33333333-3333-3333-3333-333333333333",
    orden: 1,
    habilitadoEn: new Date("2026-01-01T00:00:00.000Z"),
    abiertoWhatsappEn: null,
    confirmadoPorCliente: false,
    postulacion: { estado: "seleccionada" },
    pedido: {
      id: "22222222-2222-2222-2222-222222222222",
      clienteId: "66666666-6666-6666-6666-666666666666",
      categoriaId: "77777777-7777-7777-7777-777777777777",
      subcategoria: null,
      descripcion: "Se rompio la canilla de la cocina y pierde agua todo el dia",
      respuestasGuia: null,
      urgencia: "sin_apuro",
      franjas: ["manana"],
      direccionId: "88888888-8888-8888-8888-888888888888",
      barrioId: "99999999-9999-9999-9999-999999999999",
      lat: -34.6,
      lng: -58.4,
      estado: "contacto_habilitado",
      publicadoEn: new Date("2025-12-30T00:00:00.000Z"),
      expiraEn: new Date("2026-01-06T00:00:00.000Z"),
      cierreAutomaticoEn: new Date("2026-01-14T00:00:00.000Z"),
      desenlacePostergado: false,
      desenlace: null,
      motivoModeracion: null,
      vistas: 3,
      cantidadPostulaciones: 4,
      cantidadContactos: 1,
      creadoEn: new Date("2025-12-30T00:00:00.000Z"),
      categoria: {
        id: "77777777-7777-7777-7777-777777777777",
        nombre: "Plomería",
        slug: "plomeria",
        subcategorias: [],
        preguntasGuia: [],
        requiereMatricula: "no_exigida",
        activa: true,
      },
      direccion: {
        id: "88888888-8888-8888-8888-888888888888",
        // docs/dominio.md §7: "Direccion exacta | Solo barrio o localidad |
        // Visible para el elegido" — esta vista solo se arma para el
        // profesional con Contacto, asi que viaja completa (piso/depto
        // incluidos: nunca son publicos, pero si visibles para el elegido).
        calle: "Av. Siempreviva",
        numero: "742",
        piso: "2",
        depto: "B",
        tipoPropiedad: "casa",
        barrioId: "99999999-9999-9999-9999-999999999999",
        lat: -34.6,
        lng: -58.4,
        creadoEn: new Date("2025-12-30T00:00:00.000Z"),
      },
      barrio: { id: "99999999-9999-9999-9999-999999999999", nombre: "Palermo", activo: true },
      cliente: {
        // docs/dominio.md §7: "Telefono del cliente" y "Apellido" solo
        // visibles despues de la seleccion, para el elegido.
        nombre: "María",
        apellido: "Gómez",
        telefono: "+5491100000002",
      },
    },
    ...overrides,
  } as ContactoConPedidoYCliente;
}

describe("mapearContactoAVistaProfesional", () => {
  it("solo expone los campos de contactoVistaProfesionalSchema", () => {
    const vista = mapearContactoAVistaProfesional(crearContactoConPedidoYCliente(), {
      hayOtrosElegidos: false,
    });

    expect(Object.keys(vista).sort()).toEqual(
      Object.keys(contactoVistaProfesionalSchema.shape).sort(),
    );
  });

  it("expone telefono, apellido y direccion completos del cliente (docs/dominio.md §7)", () => {
    const vista = mapearContactoAVistaProfesional(crearContactoConPedidoYCliente(), {
      hayOtrosElegidos: false,
    });

    expect(vista.cliente).toEqual({
      nombre: "María",
      apellido: "Gómez",
      telefono: "+5491100000002",
      direccion: {
        calle: "Av. Siempreviva",
        numero: "742",
        piso: "2",
        depto: "B",
        lat: -34.6,
        lng: -58.4,
      },
      barrio: { nombre: "Palermo" },
    });
  });

  it("no expone datos del profesional: esta vista es sobre el pedido y el cliente", () => {
    const vista = mapearContactoAVistaProfesional(crearContactoConPedidoYCliente(), {
      hayOtrosElegidos: false,
    });

    expect(vista).not.toHaveProperty("profesional");
  });

  // docs/dominio.md §4 (D2): elegir a un segundo no le revela nada al
  // primero ni al reves. hayOtrosElegidos llega resuelto desde el service
  // (compara cantidadContactos > 1), no se recalcula aca: la funcion se
  // mantiene pura sobre la entidad.
  it("hayOtrosElegidos viene de las opciones, no de la entidad", () => {
    const contacto = crearContactoConPedidoYCliente();

    const vistaSolo = mapearContactoAVistaProfesional(contacto, { hayOtrosElegidos: false });
    const vistaConOtros = mapearContactoAVistaProfesional(contacto, { hayOtrosElegidos: true });

    expect(vistaSolo.hayOtrosElegidos).toBe(false);
    expect(vistaConOtros.hayOtrosElegidos).toBe(true);
  });

  it("mapea estadoPostulacion y habilitadoEn a ISO string", () => {
    const contacto = crearContactoConPedidoYCliente({ postulacion: { estado: "retirada" } });

    const vista = mapearContactoAVistaProfesional(contacto, { hayOtrosElegidos: false });

    expect(vista.estadoPostulacion).toBe("retirada");
    expect(vista.habilitadoEn).toBe(contacto.habilitadoEn.toISOString());
  });
});
