import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { EventosService } from "../eventos/eventos.service.js";
import type { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import type { ParametrosService } from "../parametros/parametros.service.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { ContactosService } from "./contactos.service.js";

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

function crearParametrosMock(
  overrides: Partial<Record<string, number | string>> = {},
): ParametrosService {
  const valores: Record<string, number | string> = {
    seleccionables_max_por_pedido: 3,
    cierre_automatico_dias: 14,
    ...overrides,
  };
  return {
    getNumero: jest.fn((clave: string) => Promise.resolve(valores[clave] as number)),
    getTexto: jest.fn((clave: string) => Promise.resolve(valores[clave] as string)),
  } as unknown as ParametrosService;
}

function crearEventosMock(): EventosService {
  return {
    registrar: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as EventosService;
}

function crearNotificacionesMock(): NotificacionesService {
  return {
    crear: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    crearVarias: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as NotificacionesService;
}

/** Ejecuta una promesa que se espera rechazada y devuelve el error para inspeccionarlo. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa rechazara, pero se resolvio.");
}

function crearPostulacionInicial(overrides: Record<string, unknown> = {}) {
  return {
    id: "postulacion-1",
    pedidoId: "pedido-1",
    profesionalId: "perfil-1",
    estado: "enviada",
    pedido: {
      id: "pedido-1",
      clienteId: "cliente-1",
      estado: "publicado",
      cantidadContactos: 0,
      categoria: { slug: "plomeria" },
      barrio: { nombre: "Palermo" },
    },
    profesional: { usuarioId: "usuario-profesional-1" },
    ...overrides,
  };
}

function crearContactoFinal(overrides: Record<string, unknown> = {}) {
  return {
    id: "contacto-1",
    pedidoId: "pedido-1",
    postulacionId: "postulacion-1",
    orden: 1,
    habilitadoEn: new Date("2026-01-01T00:00:00.000Z"),
    postulacion: {
      profesionalId: "perfil-1",
      mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
      estimacionADefinir: true,
      estimacionMin: null,
      estimacionMax: null,
      estado: "seleccionada",
      profesional: {
        promedioResenias: 4.5,
        cantidadResenias: 10,
        aniosExperiencia: 5,
        usuario: { nombre: "Juan", apellido: "Pérez", fotoUrl: null, telefono: "+5491100000001" },
      },
    },
    ...overrides,
  };
}

/**
 * PR-06/CL-08/CL-10 (docs/dominio.md §4, §7, §12 D2/D3). Reglas no negociables
 * tocadas: #1 (transicionar), #2 (visibilidad), #4 (cupo con lock). Mismo
 * patron de mocking manual de Prisma/tx que postulaciones.service.spec.ts.
 */
describe("ContactosService.seleccionar", () => {
  function crearService(
    options: {
      postulacionInicial?: Record<string, unknown> | null;
      pedidoFresco?: Record<string, unknown>;
      findManyResultado?: Record<string, unknown>[];
      contactoFinal?: Record<string, unknown>;
      parametros?: Partial<Record<string, number | string>>;
    } = {},
  ) {
    const postulacionInicial =
      options.postulacionInicial === undefined
        ? crearPostulacionInicial()
        : options.postulacionInicial;
    const pedidoFresco =
      options.pedidoFresco ??
      (postulacionInicial as { pedido?: Record<string, unknown> } | null)?.pedido;

    const tx = {
      $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined),
      pedido: {
        findUniqueOrThrow: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(pedidoFresco),
        update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(undefined),
        // Usado por transicionar() de pedidos.estados.ts (-> contacto_habilitado).
        updateMany: jest
          .fn<(args: unknown) => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
      },
      postulacion: {
        // Usado por transicionar() de postulaciones.estados.ts (seleccionada / caducada).
        updateMany: jest
          .fn<(args: unknown) => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
        findMany: jest
          .fn<(args: unknown) => Promise<unknown[]>>()
          .mockResolvedValue(options.findManyResultado ?? []),
      },
      contacto: {
        create: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue({ id: "contacto-1" }),
      },
    };

    const prisma = {
      postulacion: {
        findUnique: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(postulacionInicial),
      },
      contacto: {
        findUniqueOrThrow: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(options.contactoFinal ?? crearContactoFinal()),
      },
      $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
    };
    prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

    const parametros = crearParametrosMock(options.parametros);
    const eventos = crearEventosMock();
    const notificaciones = crearNotificacionesMock();

    const service = new ContactosService(
      prisma as unknown as PrismaService,
      parametros,
      eventos,
      notificaciones,
    );
    return { service, prisma, tx, parametros, eventos, notificaciones };
  }

  it("primera seleccion: transiciona el pedido a contacto_habilitado y fija cierreAutomaticoEn", async () => {
    const { service, tx } = crearService();

    const vista = await service.seleccionar("cliente-1", "postulacion-1");

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: { id: "pedido-1", estado: "publicado" },
      data: expect.objectContaining({
        estado: "contacto_habilitado",
        cantidadContactos: { increment: 1 },
        cierreAutomaticoEn: expect.any(Date),
      }),
    });
    expect(tx.pedido.update).not.toHaveBeenCalled();
    // El profesional viaja completo, telefono incluido (docs/dominio.md §7).
    expect(vista.profesional.telefono).toBe("+5491100000001");
  });

  it("segunda seleccion sobre un pedido ya en contacto_habilitado: no repite la transicion, solo incrementa cantidadContactos", async () => {
    const { service, tx } = crearService({
      postulacionInicial: crearPostulacionInicial({
        pedido: {
          id: "pedido-1",
          clienteId: "cliente-1",
          estado: "contacto_habilitado",
          cantidadContactos: 1,
          categoria: { slug: "plomeria" },
          barrio: { nombre: "Palermo" },
        },
      }),
    });

    await service.seleccionar("cliente-1", "postulacion-1");

    expect(tx.pedido.update).toHaveBeenCalledWith({
      where: { id: "pedido-1" },
      data: { cantidadContactos: { increment: 1 } },
    });
    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
  });

  it("tercera seleccion tampoco repite la transicion (D3: el pedido entra una sola vez a contacto_habilitado)", async () => {
    const { service, tx } = crearService({
      postulacionInicial: crearPostulacionInicial({
        pedido: {
          id: "pedido-1",
          clienteId: "cliente-1",
          estado: "contacto_habilitado",
          cantidadContactos: 2,
          categoria: { slug: "plomeria" },
          barrio: { nombre: "Palermo" },
        },
      }),
    });

    await service.seleccionar("cliente-1", "postulacion-1");

    expect(tx.pedido.update).toHaveBeenCalledWith({
      where: { id: "pedido-1" },
      data: { cantidadContactos: { increment: 1 } },
    });
    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
  });

  it("al completar el cupo de elegibles, las demas postulaciones enviada/vista pasan a caducada", async () => {
    const restantes = [
      {
        id: "postulacion-2",
        estado: "enviada",
        profesional: { usuarioId: "usuario-profesional-2" },
      },
      { id: "postulacion-3", estado: "vista", profesional: { usuarioId: "usuario-profesional-3" } },
    ];
    const { service, tx, notificaciones } = crearService({
      postulacionInicial: crearPostulacionInicial({
        pedido: {
          id: "pedido-1",
          clienteId: "cliente-1",
          estado: "contacto_habilitado",
          cantidadContactos: 2,
          categoria: { slug: "plomeria" },
          barrio: { nombre: "Palermo" },
        },
      }),
      findManyResultado: restantes,
    });

    await service.seleccionar("cliente-1", "postulacion-1");

    // El filtro en si mismo (solo enviada/vista) es la garantia de que
    // descartada/retirada/caducada nunca entran a este lote: no hay forma de
    // que transicionarPostulacion las toque si no aparecen en `restantes`.
    expect(tx.postulacion.findMany).toHaveBeenCalledWith({
      where: { pedidoId: "pedido-1", estado: { in: ["enviada", "vista"] } },
      include: { profesional: { select: { usuarioId: true } } },
    });
    expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { id: "postulacion-2", estado: "enviada" },
      data: { estado: "caducada" },
    });
    expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { id: "postulacion-3", estado: "vista" },
      data: { estado: "caducada" },
    });
    expect(notificaciones.crearVarias).toHaveBeenCalledWith([
      {
        usuarioId: "usuario-profesional-2",
        tipo: "cliente_completo_eleccion",
        objetoId: "pedido-1",
      },
      {
        usuarioId: "usuario-profesional-3",
        tipo: "cliente_completo_eleccion",
        objetoId: "pedido-1",
      },
    ]);
  });

  it("mientras quede cupo, las demas postulaciones no cambian de estado (D2: solo se avisan)", async () => {
    const vivas = [
      {
        id: "postulacion-2",
        estado: "enviada",
        profesional: { usuarioId: "usuario-profesional-2" },
      },
    ];
    const { service, tx, notificaciones } = crearService({
      postulacionInicial: crearPostulacionInicial({
        pedido: {
          id: "pedido-1",
          clienteId: "cliente-1",
          estado: "contacto_habilitado",
          cantidadContactos: 1,
          categoria: { slug: "plomeria" },
          barrio: { nombre: "Palermo" },
        },
      }),
      findManyResultado: vivas,
    });

    await service.seleccionar("cliente-1", "postulacion-1");

    expect(tx.postulacion.findMany).toHaveBeenCalledWith({
      where: {
        pedidoId: "pedido-1",
        estado: { in: ["enviada", "vista"] },
        id: { not: "postulacion-1" },
      },
      include: { profesional: { select: { usuarioId: true } } },
    });
    // El unico updateMany de postulacion es el de la propia postulacion
    // elegida (enviada -> seleccionada): las "vivas" solo se leen, no se tocan.
    expect(tx.postulacion.updateMany).toHaveBeenCalledTimes(1);
    expect(notificaciones.crearVarias).toHaveBeenCalledWith([
      { usuarioId: "usuario-profesional-2", tipo: "cliente_eligio_a_otro", objetoId: "pedido-1" },
    ]);
  });

  it("rechaza con 404 si la postulacion no es del pedido/cliente correcto (ownership)", async () => {
    const { service, prisma } = crearService({
      postulacionInicial: crearPostulacionInicial({
        pedido: {
          id: "pedido-1",
          clienteId: "otro-cliente",
          estado: "publicado",
          cantidadContactos: 0,
          categoria: { slug: "plomeria" },
          barrio: { nombre: "Palermo" },
        },
      }),
    });

    const error = await capturarError(service.seleccionar("cliente-1", "postulacion-1"));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza con conflicto si el estado de la postulacion no es enviada/vista", async () => {
    const { service, prisma } = crearService({
      postulacionInicial: crearPostulacionInicial({ estado: "retirada" }),
    });

    const error = await capturarError(service.seleccionar("cliente-1", "postulacion-1"));

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza si ya se completo el cupo de elegibles (atajo previo a la transaccion)", async () => {
    const { service, prisma } = crearService({
      postulacionInicial: crearPostulacionInicial({
        pedido: {
          id: "pedido-1",
          clienteId: "cliente-1",
          estado: "contacto_habilitado",
          cantidadContactos: 3,
          categoria: { slug: "plomeria" },
          barrio: { nombre: "Palermo" },
        },
      }),
    });

    const error = await capturarError(service.seleccionar("cliente-1", "postulacion-1"));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      codigo: "limite_excedido",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // Mismo criterio que el "bloqueante 1" de PostulacionesService.crear: el
  // chequeo de arriba (antes del lock) es solo un atajo. Si el cupo se
  // completo justo entre esa lectura y la transaccion, lo tiene que agarrar
  // la revalidacion sobre la lectura fresca (pedidoFresco), no la de antes.
  it("revalida el cupo sobre la lectura fresca de dentro de la transaccion, no sobre la de antes del lock", async () => {
    const { service, tx } = crearService({
      postulacionInicial: crearPostulacionInicial({
        pedido: {
          id: "pedido-1",
          clienteId: "cliente-1",
          estado: "contacto_habilitado",
          cantidadContactos: 1,
          categoria: { slug: "plomeria" },
          barrio: { nombre: "Palermo" },
        },
      }),
      pedidoFresco: {
        id: "pedido-1",
        clienteId: "cliente-1",
        estado: "contacto_habilitado",
        cantidadContactos: 3,
      },
    });

    const error = await capturarError(service.seleccionar("cliente-1", "postulacion-1"));

    expect(error).toBeInstanceOf(ConflictException);
    expect(tx.contacto.create).not.toHaveBeenCalled();
  });
});

describe("ContactosService.obtenerDelPedido", () => {
  it("rechaza con 404 si el pedido no es del usuario", async () => {
    const prisma = {
      pedido: {
        findUnique: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue({ clienteId: "otro-cliente" }),
      },
    };
    const service = new ContactosService(
      prisma as unknown as PrismaService,
      crearParametrosMock(),
      crearEventosMock(),
      crearNotificacionesMock(),
    );

    const error = await capturarError(service.obtenerDelPedido("cliente-1", "pedido-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("rechaza con 404 si el pedido no existe", async () => {
    const prisma = {
      pedido: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(null),
      },
    };
    const service = new ContactosService(
      prisma as unknown as PrismaService,
      crearParametrosMock(),
      crearEventosMock(),
      crearNotificacionesMock(),
    );

    const error = await capturarError(service.obtenerDelPedido("cliente-1", "pedido-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });
});

describe("ContactosService.obtenerElegido", () => {
  function crearPostulacionParaElegido(overrides: Record<string, unknown> = {}) {
    return {
      profesionalId: "perfil-1",
      estado: "seleccionada",
      contacto: {
        id: "contacto-1",
        habilitadoEn: new Date("2026-01-01T00:00:00.000Z"),
        pedido: {
          id: "pedido-1",
          cantidadContactos: 1,
          categoria: { nombre: "Plomería", slug: "plomeria" },
          descripcion: "Se rompio la canilla de la cocina",
          urgencia: "sin_apuro",
          franjas: [],
          direccion: {
            calle: "Av. Siempreviva",
            numero: "742",
            piso: null,
            depto: null,
            lat: -34.6,
            lng: -58.4,
          },
          barrio: { nombre: "Palermo" },
          cliente: { nombre: "María", apellido: "Gómez", telefono: "+5491100000002" },
        },
      },
      ...overrides,
    };
  }

  function crearServiceParaElegido(
    options: {
      perfil?: { id: string } | null;
      postulacion?: Record<string, unknown> | null;
    } = {},
  ) {
    const perfil = options.perfil === undefined ? { id: "perfil-1" } : options.perfil;
    const postulacion =
      options.postulacion === undefined ? crearPostulacionParaElegido() : options.postulacion;
    const prisma = {
      perfilProfesional: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(perfil),
      },
      postulacion: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(postulacion),
      },
    };
    const service = new ContactosService(
      prisma as unknown as PrismaService,
      crearParametrosMock(),
      crearEventosMock(),
      crearNotificacionesMock(),
    );
    return { service, prisma };
  }

  it("rechaza con 404 si el usuario no tiene perfil profesional", async () => {
    const { service } = crearServiceParaElegido({ perfil: null });

    const error = await capturarError(service.obtenerElegido("usuario-1", "postulacion-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("rechaza con 404 si la postulacion no es del profesional", async () => {
    const { service } = crearServiceParaElegido({
      postulacion: crearPostulacionParaElegido({ profesionalId: "otro-perfil" }),
    });

    const error = await capturarError(service.obtenerElegido("usuario-1", "postulacion-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("rechaza con 404 si todavia no tiene Contacto (no fue elegida)", async () => {
    const { service } = crearServiceParaElegido({
      postulacion: crearPostulacionParaElegido({ estado: "enviada", contacto: null }),
    });

    const error = await capturarError(service.obtenerElegido("usuario-1", "postulacion-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("expone el telefono/apellido/direccion completos del cliente (docs/dominio.md §7)", async () => {
    const { service } = crearServiceParaElegido();

    const vista = await service.obtenerElegido("usuario-1", "postulacion-1");

    expect(vista.cliente).toMatchObject({
      nombre: "María",
      apellido: "Gómez",
      telefono: "+5491100000002",
    });
  });

  it("hayOtrosElegidos es true cuando cantidadContactos > 1", async () => {
    const { service } = crearServiceParaElegido({
      postulacion: crearPostulacionParaElegido({
        contacto: {
          ...crearPostulacionParaElegido().contacto,
          pedido: { ...crearPostulacionParaElegido().contacto.pedido, cantidadContactos: 2 },
        },
      }),
    });

    const vista = await service.obtenerElegido("usuario-1", "postulacion-1");

    expect(vista.hayOtrosElegidos).toBe(true);
  });

  it("hayOtrosElegidos es false cuando cantidadContactos es 1 (D2: elegir a otro no le revela nada a este)", async () => {
    const { service } = crearServiceParaElegido();

    const vista = await service.obtenerElegido("usuario-1", "postulacion-1");

    expect(vista.hayOtrosElegidos).toBe(false);
  });
});

describe("ContactosService.registrarEventoContacto", () => {
  function crearContactoBase(overrides: Record<string, unknown> = {}) {
    return {
      id: "contacto-1",
      pedidoId: "pedido-1",
      abiertoWhatsappEn: null as Date | null,
      pedido: {
        clienteId: "cliente-1",
        categoria: { slug: "plomeria" },
        barrio: { nombre: "Palermo" },
      },
      postulacion: { profesional: { usuarioId: "usuario-profesional-1" } },
      ...overrides,
    };
  }

  function crearServiceParaEvento(options: { contacto?: Record<string, unknown> | null } = {}) {
    const contacto = options.contacto === undefined ? crearContactoBase() : options.contacto;
    const prisma = {
      contacto: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(contacto),
        update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(undefined),
      },
    };
    const eventos = crearEventosMock();
    const service = new ContactosService(
      prisma as unknown as PrismaService,
      crearParametrosMock(),
      eventos,
      crearNotificacionesMock(),
    );
    return { service, prisma, eventos };
  }

  it("acepta al cliente del contacto", async () => {
    const { service, eventos } = crearServiceParaEvento();

    await service.registrarEventoContacto("cliente-1", "postulacion-1", "llamada_iniciada");

    expect(eventos.registrar).toHaveBeenCalledWith(expect.objectContaining({ rol: "cliente" }));
  });

  it("acepta al profesional del contacto", async () => {
    const { service, eventos } = crearServiceParaEvento();

    await service.registrarEventoContacto(
      "usuario-profesional-1",
      "postulacion-1",
      "llamada_iniciada",
    );

    expect(eventos.registrar).toHaveBeenCalledWith(expect.objectContaining({ rol: "profesional" }));
  });

  it("rechaza con 404 a un tercero que no es ni cliente ni profesional del contacto", async () => {
    const { service } = crearServiceParaEvento();

    const error = await capturarError(
      service.registrarEventoContacto("otro-usuario", "postulacion-1", "llamada_iniciada"),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("actualiza abiertoWhatsappEn la primera vez que el cliente abre WhatsApp", async () => {
    const { service, prisma } = crearServiceParaEvento({
      contacto: crearContactoBase({ abiertoWhatsappEn: null }),
    });

    await service.registrarEventoContacto("cliente-1", "postulacion-1", "whatsapp_abierto");

    expect(prisma.contacto.update).toHaveBeenCalledWith({
      where: { id: "contacto-1" },
      data: { abiertoWhatsappEn: expect.any(Date) },
    });
  });

  it("no pisa abiertoWhatsappEn si ya estaba seteado", async () => {
    const fechaOriginal = new Date("2026-01-01T00:00:00.000Z");
    const { service, prisma } = crearServiceParaEvento({
      contacto: crearContactoBase({ abiertoWhatsappEn: fechaOriginal }),
    });

    await service.registrarEventoContacto("cliente-1", "postulacion-1", "whatsapp_abierto");

    expect(prisma.contacto.update).toHaveBeenCalledWith({
      where: { id: "contacto-1" },
      data: { abiertoWhatsappEn: fechaOriginal },
    });
  });

  it("no toca abiertoWhatsappEn cuando lo dispara el profesional, aunque el tipo sea whatsapp_abierto", async () => {
    const { service, prisma } = crearServiceParaEvento();

    await service.registrarEventoContacto(
      "usuario-profesional-1",
      "postulacion-1",
      "whatsapp_abierto",
    );

    expect(prisma.contacto.update).not.toHaveBeenCalled();
  });

  it("no toca abiertoWhatsappEn para llamada_iniciada, aunque lo dispare el cliente", async () => {
    const { service, prisma } = crearServiceParaEvento();

    await service.registrarEventoContacto("cliente-1", "postulacion-1", "llamada_iniciada");

    expect(prisma.contacto.update).not.toHaveBeenCalled();
  });
});
