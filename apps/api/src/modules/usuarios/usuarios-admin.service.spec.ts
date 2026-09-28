import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { SuspenderUsuario } from "@fixeo/shared";
import type { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { UsuariosAdminService } from "./usuarios-admin.service.js";

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

function crearUsuarioMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "usuario-1",
    telefono: "+5491100001111",
    nombre: "Ana",
    apellido: "Gómez",
    email: null,
    fotoUrl: null,
    rolActivo: "cliente",
    estado: "activo",
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function crearService(
  options: {
    usuario?: Record<string, unknown> | null;
    pedidosActivos?: { id: string; estado: string }[];
    perfil?: { id: string } | null;
    // D15, cascada sobre las POSTULACIONES PROPIAS del usuario suspendido
    // como profesional (si tiene perfil), en otros pedidos.
    postulacionesAbiertas?: { id: string; estado: string }[];
    // Fix 1 (D2/D3): postulaciones DE OTROS profesionales que caducan porque
    // el PEDIDO en el que estan se bloqueo (caducarPostulacionesAbiertas),
    // distinto de `postulacionesAbiertas` de arriba. Keyed por pedidoId.
    postulacionesAbiertasPorPedido?: Record<string, { id: string; estado: string }[]>;
    // Fix 2 (D5): contactos de los pedidos bloqueados, si llegaron a tener
    // alguno, para avisar a los profesionales ya elegidos.
    contactos?: { pedidoId: string; postulacion: { profesional: { usuarioId: string } } }[];
  } = {},
) {
  const tx = {
    usuario: {
      // Fix 4: updateMany condicional al estado de origen (guarda de
      // concurrencia atomica), no un update incondicional.
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(crearUsuarioMock({ estado: "suspendido" })),
    },
    refreshToken: {
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
    },
    notaInterna: {
      create: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ id: "nota-1" }),
    },
    pedido: {
      findMany: jest
        .fn<(args: unknown) => Promise<{ id: string; estado: string }[]>>()
        .mockResolvedValue(options.pedidosActivos ?? []),
      // transicionar() de pedidos.estados.ts: updateMany condicional al origen + findUniqueOrThrow.
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ id: "pedido-x", estado: "bloqueado" }),
    },
    perfilProfesional: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ id: string } | null>>()
        .mockResolvedValue(options.perfil === undefined ? null : options.perfil),
    },
    postulacion: {
      // Se usa para dos cosas distintas segun el `where` (ver comentario de
      // las opciones arriba): la cascada sobre el PEDIDO (pedidoId) y la
      // cascada sobre el PERFIL propio del usuario (profesionalId).
      findMany: jest.fn<
        (args: {
          where?: { pedidoId?: string; profesionalId?: string; estado?: unknown };
          select?: unknown;
        }) => Promise<{ id: string; estado: string }[]>
      >((args) => {
        const pedidoId = args?.where?.pedidoId;
        if (pedidoId !== undefined) {
          return Promise.resolve(options.postulacionesAbiertasPorPedido?.[pedidoId] ?? []);
        }
        return Promise.resolve(options.postulacionesAbiertas ?? []);
      }),
      // transicionar() de postulaciones.estados.ts: mismo patron.
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ id: "postulacion-x", estado: "caducada" }),
    },
  };

  const prisma = {
    usuario: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(options.usuario === undefined ? crearUsuarioMock() : options.usuario),
    },
    contacto: {
      findMany: jest
        .fn<
          (
            args: unknown,
          ) => Promise<{ pedidoId: string; postulacion: { profesional: { usuarioId: string } } }[]>
        >()
        .mockResolvedValue(options.contactos ?? []),
    },
    $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

  const notificaciones = {
    crearVarias: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as NotificacionesService;

  const service = new UsuariosAdminService(prisma as unknown as PrismaService, notificaciones);
  return { service, prisma, tx, notificaciones };
}

function datosSuspender(overrides: Partial<SuspenderUsuario> = {}): SuspenderUsuario {
  return { motivo: "Reiteradas denuncias de otros usuarios", ...overrides };
}

describe("UsuariosAdminService.suspender (D15: cascada sobre pedidos y postulaciones)", () => {
  it("rechaza con 404 si el usuario no existe", async () => {
    const { service, prisma } = crearService({ usuario: null });

    const error = await capturarError(
      service.suspender("moderador-1", "usuario-1", datosSuspender()),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza con conflicto si el usuario ya no esta activo, sin reintentar la cascada", async () => {
    const { service, prisma } = crearService({
      usuario: crearUsuarioMock({ estado: "suspendido" }),
    });

    const error = await capturarError(
      service.suspender("moderador-1", "usuario-1", datosSuspender()),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("pone estado suspendido (updateMany atomico condicionado al estado de origen), revoca refresh tokens activos y crea la nota interna automatica", async () => {
    const { service, tx } = crearService();

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(tx.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: "usuario-1", estado: "activo" },
      data: { estado: "suspendido" },
    });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: "usuario-1", revocadoEn: null },
      data: { revocadoEn: expect.any(Date) },
    });
    expect(tx.notaInterna.create).toHaveBeenCalledWith({
      data: {
        usuarioId: "usuario-1",
        autorId: "moderador-1",
        texto: "Usuario suspendido: Reiteradas denuncias de otros usuarios",
      },
    });
  });

  it("transiciona a bloqueado cada uno de los 4 estados activos de pedido (en_revision, publicado, con_postulaciones, contacto_habilitado)", async () => {
    const pedidosActivos = [
      { id: "pedido-revision", estado: "en_revision" },
      { id: "pedido-publicado", estado: "publicado" },
      { id: "pedido-con-postulaciones", estado: "con_postulaciones" },
      { id: "pedido-contacto", estado: "contacto_habilitado" },
    ];
    const { service, tx } = crearService({ pedidosActivos });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(tx.pedido.findMany).toHaveBeenCalledWith({
      where: {
        clienteId: "usuario-1",
        estado: { in: ["en_revision", "publicado", "con_postulaciones", "contacto_habilitado"] },
      },
      select: { id: true, estado: true },
    });
    expect(tx.pedido.updateMany).toHaveBeenCalledTimes(4);
    for (const pedido of pedidosActivos) {
      expect(tx.pedido.updateMany).toHaveBeenCalledWith({
        where: { id: pedido.id, estado: pedido.estado },
        data: { motivoModeracion: "Cuenta del cliente suspendida", estado: "bloqueado" },
      });
    }
  });

  it("no toca un pedido del mismo usuario que ya esta en un estado terminal (cerrado, cancelado, expirado o bloqueado)", async () => {
    // El where de tx.pedido.findMany ya filtra por los 4 estados activos: un
    // pedido terminal nunca llega a la lista que se itera, asi que ninguna
    // llamada a updateMany lo menciona.
    const { service, tx } = crearService({ pedidosActivos: [] });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
  });

  it("Fix 1 (docs/dominio.md §4, tabla D2): cada pedido bloqueado por la cascada caduca sus propias postulaciones abiertas (de otros profesionales)", async () => {
    const pedidosActivos = [{ id: "pedido-1", estado: "publicado" }];
    const { service, tx } = crearService({
      pedidosActivos,
      postulacionesAbiertasPorPedido: {
        "pedido-1": [{ id: "postulacion-otro-profesional", estado: "enviada" }],
      },
    });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(tx.postulacion.findMany).toHaveBeenCalledWith({
      where: { pedidoId: "pedido-1", estado: { in: ["enviada", "vista"] } },
      select: { id: true, estado: true },
    });
    expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { id: "postulacion-otro-profesional", estado: "enviada" },
      data: { estado: "caducada" },
    });
  });

  it("Fix 2 (D5): avisa a los profesionales ya elegidos en los pedidos bloqueados, buscando sus contactos despues de la transaccion", async () => {
    const pedidosActivos = [
      { id: "pedido-1", estado: "contacto_habilitado" },
      { id: "pedido-2", estado: "publicado" },
    ];
    const { service, prisma, notificaciones } = crearService({
      pedidosActivos,
      contactos: [
        {
          pedidoId: "pedido-1",
          postulacion: { profesional: { usuarioId: "profesional-elegido-1" } },
        },
      ],
    });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(prisma.contacto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pedidoId: { in: ["pedido-1", "pedido-2"] } } }),
    );
    expect(notificaciones.crearVarias).toHaveBeenCalledWith([
      { usuarioId: "profesional-elegido-1", tipo: "pedido_bloqueado", objetoId: "pedido-1" },
    ]);
  });

  it("Fix 2: sin pedidos bloqueados, no consulta contactos ni avisa a nadie", async () => {
    const { service, prisma, notificaciones } = crearService({ pedidosActivos: [] });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(prisma.contacto.findMany).not.toHaveBeenCalled();
    expect(notificaciones.crearVarias).not.toHaveBeenCalled();
  });

  it("usuario sin perfil profesional: no intenta tocar sus propias postulaciones", async () => {
    const { service, tx } = crearService({ perfil: null });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(tx.perfilProfesional.findUnique).toHaveBeenCalledWith({
      where: { usuarioId: "usuario-1" },
      select: { id: true },
    });
    expect(tx.postulacion.updateMany).not.toHaveBeenCalled();
  });

  it("caduca las postulaciones enviada/vista propias del perfil profesional del usuario", async () => {
    const postulacionesAbiertas = [
      { id: "postulacion-enviada", estado: "enviada" },
      { id: "postulacion-vista", estado: "vista" },
    ];
    const { service, tx } = crearService({
      perfil: { id: "perfil-1" },
      postulacionesAbiertas,
    });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(tx.postulacion.findMany).toHaveBeenCalledWith({
      where: { profesionalId: "perfil-1", estado: { in: ["enviada", "vista"] } },
      select: { id: true, estado: true },
    });
    for (const postulacion of postulacionesAbiertas) {
      expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
        where: { id: postulacion.id, estado: postulacion.estado },
        data: { estado: "caducada" },
      });
    }
  });

  it("no toca una postulacion propia seleccionada, retirada, descartada o caducada (el where ya las excluye)", async () => {
    const { service, tx } = crearService({
      perfil: { id: "perfil-1" },
      postulacionesAbiertas: [],
    });

    await service.suspender("moderador-1", "usuario-1", datosSuspender());

    expect(tx.postulacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profesionalId: "perfil-1", estado: { in: ["enviada", "vista"] } },
      }),
    );
    expect(tx.postulacion.updateMany).not.toHaveBeenCalled();
  });
});

describe("UsuariosAdminService.reactivar", () => {
  it("solo devuelve el acceso (estado activo, updateMany atomico): no restaura pedidos ni postulaciones", async () => {
    const { service, tx } = crearService({ usuario: crearUsuarioMock({ estado: "suspendido" }) });

    await service.reactivar("moderador-1", "usuario-1");

    expect(tx.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: "usuario-1", estado: "suspendido" },
      data: { estado: "activo" },
    });
    expect(tx.pedido.findMany).not.toHaveBeenCalled();
    expect(tx.postulacion.findMany).not.toHaveBeenCalled();
  });

  it("rechaza con conflicto si el usuario no estaba suspendido", async () => {
    const { service } = crearService({ usuario: crearUsuarioMock({ estado: "activo" }) });

    const error = await capturarError(service.reactivar("moderador-1", "usuario-1"));

    expect(error).toBeInstanceOf(ConflictException);
  });
});
