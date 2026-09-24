import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { CrearPostulacion } from "@fixeo/shared";
import type { EventosService } from "../eventos/eventos.service.js";
import type { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import type { ParametrosService } from "../parametros/parametros.service.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { PostulacionesService } from "./postulaciones.service.js";

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

function crearDatosPostulacion(overrides: Partial<CrearPostulacion> = {}): CrearPostulacion {
  return {
    pedidoId: "pedido-1",
    mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
    estimacion: { aDefinir: true },
    ...overrides,
  } as CrearPostulacion;
}

function crearPerfil(overrides: Record<string, unknown> = {}) {
  return {
    id: "perfil-1",
    usuarioId: "usuario-1",
    estadoVerificacion: "aprobada",
    pausado: false,
    oficios: [
      {
        categoriaId: "categoria-1",
        matriculaEstado: "no_requerida",
        matriculaVenceEn: null,
      },
    ],
    ...overrides,
  };
}

function crearPedido(overrides: Record<string, unknown> = {}) {
  return {
    id: "pedido-1",
    clienteId: "cliente-1",
    categoriaId: "categoria-1",
    estado: "publicado",
    cantidadContactos: 0,
    cantidadPostulaciones: 0,
    categoria: {
      id: "categoria-1",
      nombre: "Plomería",
      slug: "plomeria",
      requiereMatricula: "no_exigida",
    },
    barrio: { id: "barrio-1", nombre: "Palermo" },
    ...overrides,
  };
}

function crearParametrosMock(
  overrides: Partial<Record<string, number | string>> = {},
): ParametrosService {
  const valores: Record<string, number | string> = {
    seleccionables_max_por_pedido: 3,
    postulaciones_max_por_pedido: 8,
    postulaciones_max_por_profesional_dia: 10,
    limite_diario_zona_horaria: "America/Argentina/Buenos_Aires",
    descarte_reversible_horas: 24,
    ...overrides,
  };
  return {
    getNumero: jest.fn((clave: string) => Promise.resolve(valores[clave] as number)),
    getTexto: jest.fn((clave: string) => Promise.resolve(valores[clave] as string)),
  } as unknown as ParametrosService;
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

describe("PostulacionesService.crear", () => {
  function crearService(
    options: {
      perfil?: ReturnType<typeof crearPerfil> | null;
      pedido?: ReturnType<typeof crearPedido> | null;
      pedidoFresco?: Record<string, unknown>;
      yaPostulado?: { id: string } | null;
      postulacionCreada?: Record<string, unknown>;
      parametros?: Partial<Record<string, number | string>>;
    } = {},
  ) {
    const pedidoInicial = options.pedido === undefined ? crearPedido() : options.pedido;
    // Por defecto, "la lectura fresca dentro de la transaccion" coincide con
    // la lectura de arriba: los tests que ejercitan la condicion de carrera
    // (bloqueante 1) la pisan a proposito.
    const pedidoFresco = options.pedidoFresco ?? pedidoInicial;

    const tx = {
      $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined),
      pedido: {
        findUniqueOrThrow: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(pedidoFresco),
        update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(undefined),
        // Usado por transicionar() de pedidos.estados.ts (publicado -> con_postulaciones).
        updateMany: jest
          .fn<(args: unknown) => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
      },
      postulacion: {
        count: jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0),
        create: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(
          options.postulacionCreada ?? {
            id: "postulacion-1",
            pedidoId: "pedido-1",
            profesionalId: "perfil-1",
            mensaje: crearDatosPostulacion().mensaje,
            estimacionADefinir: true,
            estimacionMin: null,
            estimacionMax: null,
            disponibilidad: null,
            estado: "enviada",
            enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
            vistaEn: null,
          },
        ),
      },
    };

    const perfil = options.perfil === undefined ? crearPerfil() : options.perfil;

    const prisma = {
      perfilProfesional: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(perfil),
      },
      pedido: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(pedidoInicial),
      },
      postulacion: {
        findUnique: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(options.yaPostulado ?? null),
      },
      $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
    };
    prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

    const parametros = crearParametrosMock(options.parametros);
    const eventos = {
      registrar: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as EventosService;
    const notificaciones = {
      crear: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as NotificacionesService;

    const service = new PostulacionesService(
      prisma as unknown as PrismaService,
      parametros,
      eventos,
      notificaciones,
    );
    return { service, prisma, tx, parametros, eventos, notificaciones };
  }

  it("rechaza con 404 si el pedido es del propio usuario (una cuenta con los dos roles no se autopostula)", async () => {
    const { service, tx } = crearService({
      pedido: crearPedido({ clienteId: "usuario-1" }),
    });

    const error = await capturarError(service.crear("usuario-1", crearDatosPostulacion()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(tx.postulacion.create).not.toHaveBeenCalled();
  });

  it("rechaza con 403 si el perfil esta pausado", async () => {
    const { service, tx } = crearService({
      perfil: crearPerfil({ pausado: true }),
    });

    const error = await capturarError(service.crear("usuario-1", crearDatosPostulacion()));

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(tx.postulacion.create).not.toHaveBeenCalled();
  });

  // Bloqueante 1 (revision de codigo del slice 6): antes, `puedeRecibirPostulaciones`
  // solo corria sobre la lectura de arriba (previa al lock). Si el pedido
  // cambiaba de estado justo antes de la transaccion, esa lectura vieja ya no
  // reflejaba la realidad y la postulacion se colaba igual. Este test fija la
  // lectura de arriba en "publicado" (acepta) y la lectura fresca dentro de la
  // transaccion en "cancelado" (no acepta), para probar que el service revisa
  // la fresca.
  it("revalida la elegibilidad del pedido sobre la lectura fresca de dentro de la transaccion, no sobre la de antes del lock", async () => {
    const { service, tx } = crearService({
      pedido: crearPedido({ estado: "publicado" }),
      pedidoFresco: crearPedido({ estado: "cancelado" }),
    });

    const error = await capturarError(service.crear("usuario-1", crearDatosPostulacion()));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ codigo: "conflicto" });
    expect(tx.postulacion.create).not.toHaveBeenCalled();
  });

  it("crea la postulacion cuando la lectura fresca sigue aceptando postulaciones", async () => {
    const { service, tx } = crearService();

    const vista = await service.crear("usuario-1", crearDatosPostulacion());

    expect(tx.postulacion.create).toHaveBeenCalled();
    expect(vista.estado).toBe("enviada");
  });
});

describe("PostulacionesService.retirar", () => {
  function crearServiceParaRetirar(
    options: {
      perfil?: { id: string } | null;
      postulacion?: Record<string, unknown> | null;
    } = {},
  ) {
    const perfil = options.perfil === undefined ? { id: "perfil-1" } : options.perfil;
    const postulacionBase = {
      id: "postulacion-1",
      profesionalId: "perfil-1",
      estado: "enviada",
      mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
      estimacionADefinir: true,
      estimacionMin: null,
      estimacionMax: null,
      disponibilidad: null,
      enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
      vistaEn: null,
      pedido: {
        id: "pedido-1",
        cantidadContactos: 0,
        estado: "publicado",
        categoria: { nombre: "Plomería", slug: "plomeria" },
        descripcion: "Descripcion de prueba",
      },
    };
    const postulacion = options.postulacion === undefined ? postulacionBase : options.postulacion;

    const tx = {
      postulacion: {
        updateMany: jest
          .fn<(args: unknown) => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
        // Usado por transicionar() de postulaciones.estados.ts.
        findUniqueOrThrow: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue({ ...(postulacion as Record<string, unknown>), estado: "retirada" }),
      },
    };

    const prisma = {
      perfilProfesional: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(perfil),
      },
      postulacion: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(postulacion),
        findUniqueOrThrow: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue({ ...(postulacion as Record<string, unknown>), estado: "retirada" }),
      },
      $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
    };
    prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

    const parametros = crearParametrosMock();
    const eventos = {
      registrar: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as EventosService;
    const notificaciones = {
      crear: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as NotificacionesService;

    const service = new PostulacionesService(
      prisma as unknown as PrismaService,
      parametros,
      eventos,
      notificaciones,
    );
    return { service, prisma, tx };
  }

  it("permite retirar una postulacion 'enviada'", async () => {
    const { service, tx } = crearServiceParaRetirar();

    const vista = await service.retirar("usuario-1", "postulacion-1");

    expect(tx.postulacion.updateMany).toHaveBeenCalled();
    expect(vista.estado).toBe("retirada");
  });

  it("permite retirar una postulacion 'vista'", async () => {
    const { service, tx } = crearServiceParaRetirar({
      postulacion: {
        id: "postulacion-1",
        profesionalId: "perfil-1",
        estado: "vista",
        mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
        estimacionADefinir: true,
        estimacionMin: null,
        estimacionMax: null,
        disponibilidad: null,
        enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
        vistaEn: new Date("2026-01-01T01:00:00.000Z"),
        pedido: {
          id: "pedido-1",
          cantidadContactos: 0,
          estado: "publicado",
          categoria: { nombre: "Plomería", slug: "plomeria" },
          descripcion: "Descripcion de prueba",
        },
      },
    });

    const vista = await service.retirar("usuario-1", "postulacion-1");

    expect(tx.postulacion.updateMany).toHaveBeenCalled();
    expect(vista.estado).toBe("retirada");
  });

  // Bloqueante 7 (revision de codigo del slice 6): una postulacion ya
  // "seleccionada" no se puede "retirar" por PR-05 (eso pasa a ser PR-06,
  // que todavia no existe). La transicion en si sigue habilitada en
  // postulaciones.estados.ts para cuando se construya ese caso de uso, pero
  // este metodo puntual no la tiene que poder disparar.
  it("rechaza con conflicto si la postulacion ya esta 'seleccionada', sin tocar la base", async () => {
    const { service, tx, prisma } = crearServiceParaRetirar({
      postulacion: {
        id: "postulacion-1",
        profesionalId: "perfil-1",
        estado: "seleccionada",
        mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
        estimacionADefinir: true,
        estimacionMin: null,
        estimacionMax: null,
        disponibilidad: null,
        enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
        vistaEn: new Date("2026-01-01T01:00:00.000Z"),
        pedido: {
          id: "pedido-1",
          cantidadContactos: 1,
          estado: "contacto_habilitado",
          categoria: { nombre: "Plomería", slug: "plomeria" },
          descripcion: "Descripcion de prueba",
        },
      },
    });

    const error = await capturarError(service.retirar("usuario-1", "postulacion-1"));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ codigo: "conflicto" });
    expect(tx.postulacion.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("404 si la postulacion no existe o es de otro profesional", async () => {
    const { service } = crearServiceParaRetirar({ postulacion: null });

    const error = await capturarError(service.retirar("usuario-1", "postulacion-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });
});

describe("PostulacionesService.noPuedoTomarlo", () => {
  function crearServiceParaNoPuedoTomarlo(
    options: {
      perfil?: { id: string } | null;
      postulacion?: Record<string, unknown> | null;
    } = {},
  ) {
    const perfil = options.perfil === undefined ? { id: "perfil-1" } : options.perfil;
    const postulacionBase = {
      id: "postulacion-1",
      pedidoId: "pedido-1",
      profesionalId: "perfil-1",
      estado: "seleccionada",
      mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
      estimacionADefinir: true,
      estimacionMin: null,
      estimacionMax: null,
      disponibilidad: null,
      enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
      vistaEn: new Date("2026-01-01T01:00:00.000Z"),
      pedido: {
        id: "pedido-1",
        clienteId: "cliente-1",
        cantidadContactos: 1,
        estado: "contacto_habilitado",
        categoria: { nombre: "Plomería", slug: "plomeria" },
        descripcion: "Descripcion de prueba",
      },
    };
    const postulacion = options.postulacion === undefined ? postulacionBase : options.postulacion;

    // A proposito sin las claves "pedido" ni "contacto": D3 dice que
    // "no puedo tomarlo" no libera cupo, no decrementa cantidadContactos ni
    // toca la fila Contacto. Si un cambio futuro tocara alguna de las dos
    // tablas dentro de la misma transaccion, este mock explotaria con un
    // TypeError en vez de dejar pasar el bug en silencio.
    const tx = {
      postulacion: {
        updateMany: jest
          .fn<(args: unknown) => Promise<{ count: number }>>()
          .mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue({ ...(postulacion as Record<string, unknown>), estado: "retirada" }),
      },
    };

    const prisma = {
      perfilProfesional: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(perfil),
      },
      postulacion: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(postulacion),
        findUniqueOrThrow: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue({ ...(postulacion as Record<string, unknown>), estado: "retirada" }),
      },
      $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
    };
    prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

    const parametros = crearParametrosMock();
    const eventos = {
      registrar: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as EventosService;
    const notificaciones = {
      crear: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as NotificacionesService;

    const service = new PostulacionesService(
      prisma as unknown as PrismaService,
      parametros,
      eventos,
      notificaciones,
    );
    return { service, prisma, tx, notificaciones };
  }

  it("transiciona 'seleccionada' -> 'retirada' y avisa al cliente, sin tocar pedido ni contacto", async () => {
    const { service, tx, notificaciones } = crearServiceParaNoPuedoTomarlo();

    const vista = await service.noPuedoTomarlo("usuario-1", "postulacion-1");

    expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { id: "postulacion-1", estado: "seleccionada" },
      data: { estado: "retirada" },
    });
    expect(vista.estado).toBe("retirada");
    expect(notificaciones.crear).toHaveBeenCalledWith({
      usuarioId: "cliente-1",
      tipo: "profesional_no_puede_tomarlo",
      objetoId: "pedido-1",
    });
  });

  it.each(["enviada", "vista", "descartada", "retirada", "caducada"] as const)(
    "rechaza con conflicto desde el estado '%s', sin tocar la base",
    async (estadoOrigen) => {
      const { service, tx, prisma } = crearServiceParaNoPuedoTomarlo({
        postulacion: {
          id: "postulacion-1",
          profesionalId: "perfil-1",
          estado: estadoOrigen,
          mensaje: "Puedo pasar mañana a la tarde para revisar la instalación completa",
          estimacionADefinir: true,
          estimacionMin: null,
          estimacionMax: null,
          disponibilidad: null,
          enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
          vistaEn: null,
          pedido: {
            id: "pedido-1",
            clienteId: "cliente-1",
            cantidadContactos: 0,
            estado: "publicado",
            categoria: { nombre: "Plomería", slug: "plomeria" },
            descripcion: "Descripcion de prueba",
          },
        },
      });

      const error = await capturarError(service.noPuedoTomarlo("usuario-1", "postulacion-1"));

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ codigo: "conflicto" });
      expect(tx.postulacion.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it("404 si la postulacion no existe o es de otro profesional", async () => {
    const { service } = crearServiceParaNoPuedoTomarlo({ postulacion: null });

    const error = await capturarError(service.noPuedoTomarlo("usuario-1", "postulacion-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });
});
