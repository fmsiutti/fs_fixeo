import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";
import type { ResolverEnRevision, ResolverPedidoDenunciado } from "@fixeo/shared";
import type { EventosService } from "../eventos/eventos.service.js";
import type { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import type { ParametrosService } from "../parametros/parametros.service.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { AvisoMatchingJobData } from "../../infra/queue/colas.constants.js";
import { PedidosModeracionService } from "./pedidos-moderacion.service.js";

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

/** Ejecuta una promesa que se espera rechazada y devuelve el error para inspeccionarlo. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa rechazara, pero se resolvio.");
}

function crearPedidoMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "pedido-1",
    clienteId: "cliente-1",
    estado: "en_revision",
    descripcion: "Necesito arreglar una perdida de agua",
    urgencia: "sin_apuro",
    motivoModeracion: null,
    fotos: [],
    cliente: { nombre: "Ana", apellido: "Gómez" },
    categoria: { nombre: "Plomería", slug: "plomeria" },
    barrio: { id: "barrio-1", nombre: "Palermo" },
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function crearParametrosMock(overrides: Partial<Record<string, number>> = {}): ParametrosService {
  const valores: Record<string, number> = { pedido_vigencia_dias: 7, ...overrides };
  return {
    getNumero: jest.fn((clave: string) => Promise.resolve(valores[clave])),
    getTexto: jest.fn(),
  } as unknown as ParametrosService;
}

function crearService(
  options: {
    pedido?: Record<string, unknown> | null;
    pedidoActualizado?: Record<string, unknown>;
    denunciasPendientes?: { id: string }[];
    parametros?: Partial<Record<string, number>>;
    // Fix 1 (caducarPostulacionesAbiertas): postulaciones enviada/vista del
    // pedido que se bloquea. Vacio por default: ningun profesional con
    // postulacion abierta en el pedido.
    postulacionesAbiertas?: { id: string; estado: string }[];
    // Fix 2 (D5, avisar a los elegidos): contactos del pedido, si llego a
    // tener alguno. Vacio por default: nadie fue elegido todavia.
    contactos?: { postulacion: { profesional: { usuarioId: string } } }[];
  } = {},
) {
  const tx = {
    pedido: {
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(options.pedido ?? crearPedidoMock()),
    },
    denuncia: {
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
    },
    postulacion: {
      findMany: jest
        .fn<(args: unknown) => Promise<{ id: string; estado: string }[]>>()
        .mockResolvedValue(options.postulacionesAbiertas ?? []),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ id: "postulacion-x", estado: "caducada" }),
    },
  };

  const prisma = {
    pedido: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(options.pedido === undefined ? crearPedidoMock() : options.pedido),
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(options.pedidoActualizado ?? crearPedidoMock({ estado: "publicado" })),
    },
    denuncia: {
      findMany: jest
        .fn<(args: unknown) => Promise<{ id: string }[]>>()
        .mockResolvedValue(options.denunciasPendientes ?? [{ id: "denuncia-1" }]),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
    },
    contacto: {
      findMany: jest
        .fn<(args: unknown) => Promise<{ postulacion: { profesional: { usuarioId: string } } }[]>>()
        .mockResolvedValue(options.contactos ?? []),
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
    crearVarias: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as NotificacionesService;
  const colaAvisoMatching = {
    add: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined),
  } as unknown as Queue<AvisoMatchingJobData>;

  const service = new PedidosModeracionService(
    prisma as unknown as PrismaService,
    parametros,
    eventos,
    notificaciones,
    colaAvisoMatching,
  );
  return { service, prisma, tx, parametros, eventos, notificaciones, colaAvisoMatching };
}

function datosResolverEnRevision(overrides: Partial<ResolverEnRevision> = {}): ResolverEnRevision {
  return { accion: "aprobar", ...overrides } as ResolverEnRevision;
}

function datosResolverDenuncia(
  overrides: Partial<ResolverPedidoDenunciado> = {},
): ResolverPedidoDenunciado {
  return { accion: "descartar", ...overrides } as ResolverPedidoDenunciado;
}

describe("PedidosModeracionService.resolverEnRevision", () => {
  it("rechaza con 404 si el pedido no existe", async () => {
    const { service, prisma } = crearService({ pedido: null });

    const error = await capturarError(
      service.resolverEnRevision("moderador-1", "pedido-1", datosResolverEnRevision()),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza con conflicto si el pedido ya no esta en_revision", async () => {
    const { service, prisma } = crearService({ pedido: crearPedidoMock({ estado: "publicado" }) });

    const error = await capturarError(
      service.resolverEnRevision("moderador-1", "pedido-1", datosResolverEnRevision()),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("aprobar: transiciona a publicado fijando publicadoEn/expiraEn recien aca (D1), registra el evento y encola el aviso de matching", async () => {
    const { service, tx, eventos, colaAvisoMatching, notificaciones } = crearService({
      parametros: { pedido_vigencia_dias: 7 },
    });

    await service.resolverEnRevision("moderador-1", "pedido-1", datosResolverEnRevision());

    expect(tx.pedido.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pedido-1", estado: "en_revision" },
        data: expect.objectContaining({
          estado: "publicado",
          publicadoEn: expect.any(Date),
          expiraEn: expect.any(Date),
        }),
      }),
    );
    const llamada = (tx.pedido.updateMany as jest.Mock<(args: unknown) => unknown>).mock
      .calls[0]![0] as {
      data: { publicadoEn: Date; expiraEn: Date };
    };
    const diferenciaDias =
      (llamada.data.expiraEn.getTime() - llamada.data.publicadoEn.getTime()) /
      (24 * 60 * 60 * 1000);
    expect(diferenciaDias).toBeCloseTo(7);

    expect(eventos.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "pedido_publicado",
        rol: "moderador",
        usuarioId: "moderador-1",
      }),
    );
    expect(colaAvisoMatching.add).toHaveBeenCalledWith(
      "aviso-matching",
      expect.objectContaining({ pedidoId: "pedido-1" }),
    );
    expect(notificaciones.crear).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "cliente-1", tipo: "pedido_revision_aprobado" }),
    );
  });

  it("rechazar: transiciona a bloqueado con motivoModeracion armado (motivo + detalle), sin evento ni aviso de matching", async () => {
    const { service, tx, eventos, colaAvisoMatching, notificaciones } = crearService();

    await service.resolverEnRevision(
      "moderador-1",
      "pedido-1",
      datosResolverEnRevision({
        accion: "rechazar",
        motivo: "datos_de_contacto",
        detalle: "El texto menciona un telefono",
      }),
    );

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: { id: "pedido-1", estado: "en_revision" },
      data: {
        estado: "bloqueado",
        motivoModeracion: "datos_de_contacto: El texto menciona un telefono",
      },
    });
    expect(eventos.registrar).not.toHaveBeenCalled();
    expect(colaAvisoMatching.add).not.toHaveBeenCalled();
    expect(notificaciones.crear).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "cliente-1", tipo: "pedido_revision_rechazado" }),
    );
  });

  it("rechazar sin detalle: motivoModeracion es solo el motivo, sin dos puntos colgando", async () => {
    const { service, tx } = crearService();

    await service.resolverEnRevision(
      "moderador-1",
      "pedido-1",
      datosResolverEnRevision({ accion: "rechazar", motivo: "otro" }),
    );

    expect(tx.pedido.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ motivoModeracion: "otro" }) }),
    );
  });
});

describe("PedidosModeracionService.resolverDenuncia", () => {
  it("rechaza con 404 si el pedido no existe", async () => {
    const { service, prisma } = crearService({ pedido: null });

    const error = await capturarError(
      service.resolverDenuncia("moderador-1", "pedido-1", datosResolverDenuncia()),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza con 404 si el pedido no tiene denuncias pendientes", async () => {
    const { service, prisma } = crearService({ denunciasPendientes: [] });

    const error = await capturarError(
      service.resolverDenuncia("moderador-1", "pedido-1", datosResolverDenuncia()),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("descartar: solo cierra las denuncias, nunca toca el pedido (no pasa por transicionar)", async () => {
    const { service, tx, prisma, notificaciones } = crearService({
      denunciasPendientes: [{ id: "denuncia-1" }, { id: "denuncia-2" }],
    });

    await service.resolverDenuncia("moderador-1", "pedido-1", datosResolverDenuncia());

    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.denuncia.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["denuncia-1", "denuncia-2"] } },
      data: { estado: "descartada", resueltaEn: expect.any(Date) },
    });
    expect(notificaciones.crear).not.toHaveBeenCalled();
  });

  it("bloquear: transiciona el pedido a bloqueado (D5, desde cualquier estado activo), caduca sus postulaciones abiertas y cierra las denuncias en la misma transaccion", async () => {
    const { service, tx, notificaciones } = crearService({
      pedido: crearPedidoMock({ estado: "contacto_habilitado" }),
      denunciasPendientes: [{ id: "denuncia-1" }],
      postulacionesAbiertas: [{ id: "postulacion-1", estado: "enviada" }],
    });

    await service.resolverDenuncia(
      "moderador-1",
      "pedido-1",
      datosResolverDenuncia({ accion: "bloquear", motivo: "contenido_inapropiado" }),
    );

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: { id: "pedido-1", estado: "contacto_habilitado" },
      data: { estado: "bloqueado", motivoModeracion: "contenido_inapropiado" },
    });
    // Fix 1 (docs/dominio.md §4, tabla D2): postulaciones enviada/vista del
    // pedido caducan en la misma transaccion que el bloqueo.
    expect(tx.postulacion.findMany).toHaveBeenCalledWith({
      where: { pedidoId: "pedido-1", estado: { in: ["enviada", "vista"] } },
      select: { id: true, estado: true },
    });
    expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { id: "postulacion-1", estado: "enviada" },
      data: { estado: "caducada" },
    });
    expect(tx.denuncia.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["denuncia-1"] } },
      data: { estado: "resuelta", resueltaEn: expect.any(Date) },
    });
    // Fix 7: tipo propio, no "pedido_revision_rechazado" (este pedido nunca paso por revision).
    expect(notificaciones.crear).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "cliente-1", tipo: "pedido_bloqueado" }),
    );
  });

  it("bloquear: avisa a cada profesional ya elegido (D5), buscando los contactos del pedido despues de la transaccion", async () => {
    const { service, prisma, notificaciones } = crearService({
      pedido: crearPedidoMock({ estado: "contacto_habilitado" }),
      denunciasPendientes: [{ id: "denuncia-1" }],
      contactos: [
        { postulacion: { profesional: { usuarioId: "profesional-elegido-1" } } },
        { postulacion: { profesional: { usuarioId: "profesional-elegido-2" } } },
      ],
    });

    await service.resolverDenuncia(
      "moderador-1",
      "pedido-1",
      datosResolverDenuncia({ accion: "bloquear", motivo: "contenido_inapropiado" }),
    );

    expect(prisma.contacto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pedidoId: "pedido-1" } }),
    );
    expect(notificaciones.crearVarias).toHaveBeenCalledWith([
      { usuarioId: "profesional-elegido-1", tipo: "pedido_bloqueado", objetoId: "pedido-1" },
      { usuarioId: "profesional-elegido-2", tipo: "pedido_bloqueado", objetoId: "pedido-1" },
    ]);
  });

  it("bloquear: sin contactos (nadie elegido todavia), no llama a crearVarias", async () => {
    const { service, notificaciones } = crearService({
      pedido: crearPedidoMock({ estado: "contacto_habilitado" }),
      denunciasPendientes: [{ id: "denuncia-1" }],
      contactos: [],
    });

    await service.resolverDenuncia(
      "moderador-1",
      "pedido-1",
      datosResolverDenuncia({ accion: "bloquear", motivo: "contenido_inapropiado" }),
    );

    expect(notificaciones.crearVarias).not.toHaveBeenCalled();
  });

  it("bloquear: rechaza con conflicto si el pedido ya esta en un estado terminal (no hay transicion valida)", async () => {
    const { service, tx } = crearService({
      pedido: crearPedidoMock({ estado: "cerrado" }),
      denunciasPendientes: [{ id: "denuncia-1" }],
    });

    const error = await capturarError(
      service.resolverDenuncia(
        "moderador-1",
        "pedido-1",
        datosResolverDenuncia({ accion: "bloquear", motivo: "otro" }),
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(tx.denuncia.updateMany).not.toHaveBeenCalled();
  });
});
