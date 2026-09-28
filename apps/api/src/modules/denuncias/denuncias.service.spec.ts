import { describe, expect, it, jest } from "@jest/globals";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { ResolverDenunciaModeracion } from "@fixeo/shared";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { DenunciasService } from "./denuncias.service.js";

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

function crearDenunciaMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "denuncia-1",
    tipoObjeto: "perfil",
    objetoId: "perfil-1",
    motivo: "Contenido inapropiado",
    detalle: null,
    estado: "pendiente",
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    reportante: { nombre: "Ana", apellido: "Gómez" },
    ...overrides,
  };
}

function crearServiceBase(
  options: {
    denuncia?: Record<string, unknown> | null;
    perfil?: Record<string, unknown> | null;
    postulacion?: Record<string, unknown> | null;
    resenia?: Record<string, unknown> | null;
    // Fix 4 (guarda de concurrencia atomica): cantidad de filas que "gana" el
    // updateMany. 1 por default (caso feliz); 0 simula que otro moderador ya
    // resolvio la denuncia entre el findUnique y el updateMany.
    denunciaUpdateManyCount?: number;
    txDenunciaUpdateManyCount?: number;
  } = {},
) {
  const tx = {
    denuncia: {
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: options.txDenunciaUpdateManyCount ?? 1 }),
    },
    resenia: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(
          options.resenia === undefined ? { profesionalId: "perfil-resenia-1" } : options.resenia,
        ),
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
      aggregate: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ _avg: { puntaje: 4 }, _count: { _all: 3 } }),
    },
    perfilProfesional: {
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
    },
  };

  const prisma = {
    denuncia: {
      findMany: jest
        .fn<(args: unknown) => Promise<Record<string, unknown>[]>>()
        .mockResolvedValue([]),
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(options.denuncia === undefined ? crearDenunciaMock() : options.denuncia),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: options.denunciaUpdateManyCount ?? 1 }),
    },
    perfilProfesional: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(
          options.perfil === undefined
            ? {
                usuario: { id: "usuario-perfil-1", nombre: "Beto", apellido: "Pérez" },
              }
            : options.perfil,
        ),
    },
    postulacion: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(
          options.postulacion === undefined
            ? {
                profesional: {
                  usuario: { id: "usuario-postulante-1", nombre: "Cami", apellido: "Ruiz" },
                },
                pedido: { descripcion: "Se rompio la canilla de la cocina y pierde agua" },
              }
            : options.postulacion,
        ),
    },
    resenia: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(
          options.resenia === undefined
            ? {
                puntaje: 4,
                profesional: {
                  usuario: { nombre: "Nico", apellido: "Díaz" },
                },
                cliente: { id: "usuario-cliente-resenia-1", nombre: "Marina", apellido: "Sosa" },
              }
            : options.resenia,
        ),
    },
    pedido: { findUnique: jest.fn<(args: unknown) => Promise<unknown>>() },
    $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

  const service = new DenunciasService(prisma as unknown as PrismaService);
  return { service, prisma, tx };
}

function datosResolver(
  overrides: Partial<ResolverDenunciaModeracion> = {},
): ResolverDenunciaModeracion {
  return { accion: "descartar", ...overrides };
}

describe("DenunciasService.listarNoPedido", () => {
  it("arma el resumen y usuarioId de una denuncia de perfil", async () => {
    const { service, prisma } = crearServiceBase();
    prisma.denuncia.findMany.mockResolvedValue([crearDenunciaMock({ tipoObjeto: "perfil" })]);

    const pagina = await service.listarNoPedido();

    expect(pagina.items[0]).toMatchObject({
      resumen: "Perfil de Beto Pérez",
      usuarioId: "usuario-perfil-1",
    });
  });

  it("arma el resumen y usuarioId de una denuncia de postulacion, con la descripcion del pedido truncada", async () => {
    const { service, prisma } = crearServiceBase();
    prisma.denuncia.findMany.mockResolvedValue([
      crearDenunciaMock({ id: "denuncia-2", tipoObjeto: "postulacion", objetoId: "postulacion-1" }),
    ]);

    const pagina = await service.listarNoPedido();

    expect(pagina.items[0]).toMatchObject({
      resumen: 'Postulación de Cami Ruiz en "Se rompio la canilla de la cocina y pierde agua"',
      usuarioId: "usuario-postulante-1",
    });
  });

  it("arma el resumen y usuarioId de una denuncia de resenia: el resumen menciona al profesional, pero usuarioId apunta al cliente que la escribio (Fix 6)", async () => {
    const { service, prisma } = crearServiceBase();
    prisma.denuncia.findMany.mockResolvedValue([
      crearDenunciaMock({ id: "denuncia-3", tipoObjeto: "resenia", objetoId: "resenia-1" }),
    ]);

    const pagina = await service.listarNoPedido();

    expect(pagina.items[0]).toMatchObject({
      resumen: "Reseña (4★) a Nico Díaz",
      usuarioId: "usuario-cliente-resenia-1",
    });
  });

  it("cuando el objeto denunciado ya no existe, cae al resumen de fallback sin usuarioId", async () => {
    const { service, prisma } = crearServiceBase({ perfil: null });
    prisma.denuncia.findMany.mockResolvedValue([crearDenunciaMock({ tipoObjeto: "perfil" })]);

    const pagina = await service.listarNoPedido();

    expect(pagina.items[0]).toMatchObject({ resumen: "Perfil ya no disponible", usuarioId: null });
  });

  it("pagina por cursor: pide 21 filas, corta a 20 y usa la fila 20 como cursor de la siguiente pagina", async () => {
    const { service, prisma } = crearServiceBase();
    const primeraTanda = Array.from({ length: 21 }, (_, indice) =>
      crearDenunciaMock({ id: `denuncia-${indice + 1}`, tipoObjeto: "perfil" }),
    );
    prisma.denuncia.findMany.mockImplementation((args) => {
      const cursorId = (args as { cursor?: { id: string } } | undefined)?.cursor?.id;
      if (cursorId === "denuncia-20") {
        return Promise.resolve([crearDenunciaMock({ id: "denuncia-21", tipoObjeto: "perfil" })]);
      }
      return Promise.resolve(primeraTanda);
    });

    const primeraPagina = await service.listarNoPedido();
    expect(primeraPagina.items).toHaveLength(20);
    expect(primeraPagina.cursor).toBe("denuncia-20");
    expect(primeraPagina.items.some((item) => item.id === "denuncia-21")).toBe(false);

    const segundaPagina = await service.listarNoPedido(primeraPagina.cursor ?? undefined);
    expect(segundaPagina.items).toHaveLength(1);
    expect(segundaPagina.items[0]?.id).toBe("denuncia-21");
    expect(segundaPagina.cursor).toBeNull();
  });
});

describe("DenunciasService.resolverNoPedido", () => {
  it("rechaza con 404 si la denuncia no existe", async () => {
    const { service, prisma } = crearServiceBase({ denuncia: null });

    const error = await capturarError(
      service.resolverNoPedido("moderador-1", "denuncia-1", datosResolver()),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza con validacion (400) si la denuncia es de un pedido: esas se resuelven desde /admin/pedidos", async () => {
    const { service, prisma } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "pedido", objetoId: "pedido-1" }),
    });

    const error = await capturarError(
      service.resolverNoPedido("moderador-1", "denuncia-1", datosResolver()),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.denuncia.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("Fix 4: rechaza con conflicto (updateMany atomico, count 0) si otro moderador ya resolvio esta denuncia de perfil/postulacion", async () => {
    const { service } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "perfil" }),
      denunciaUpdateManyCount: 0,
    });

    const error = await capturarError(
      service.resolverNoPedido("moderador-1", "denuncia-1", datosResolver()),
    );

    expect(error).toBeInstanceOf(ConflictException);
  });

  it("descartar (perfil/postulacion): solo cierra la denuncia por su id, no toca el objeto denunciado", async () => {
    const { service, prisma, tx } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "postulacion", objetoId: "postulacion-1" }),
    });

    await service.resolverNoPedido(
      "moderador-1",
      "denuncia-1",
      datosResolver({ accion: "descartar" }),
    );

    expect(prisma.denuncia.updateMany).toHaveBeenCalledWith({
      where: { id: "denuncia-1", estado: "pendiente" },
      data: { estado: "descartada", resueltaEn: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.resenia.update).not.toHaveBeenCalled();
  });

  it("resolver sobre perfil: solo cierra la denuncia por su id, sin sancion automatica sobre el objeto", async () => {
    const { service, prisma, tx } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "perfil", objetoId: "perfil-1" }),
    });

    await service.resolverNoPedido(
      "moderador-1",
      "denuncia-1",
      datosResolver({ accion: "resolver" }),
    );

    expect(prisma.denuncia.updateMany).toHaveBeenCalledWith({
      where: { id: "denuncia-1", estado: "pendiente" },
      data: { estado: "resuelta", resueltaEn: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.resenia.update).not.toHaveBeenCalled();
  });

  it("resolver sobre postulacion: solo cierra la denuncia por su id, sin sancion automatica sobre el objeto", async () => {
    const { service, prisma } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "postulacion", objetoId: "postulacion-1" }),
    });

    await service.resolverNoPedido(
      "moderador-1",
      "denuncia-1",
      datosResolver({ accion: "resolver" }),
    );

    expect(prisma.denuncia.updateMany).toHaveBeenCalledWith({
      where: { id: "denuncia-1", estado: "pendiente" },
      data: { estado: "resuelta", resueltaEn: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("descartar sobre resenia: cierra TODAS las denuncias pendientes de esa misma reseña, no solo la que se clickeo (Fix 3)", async () => {
    const { service, prisma, tx } = crearServiceBase({
      denuncia: crearDenunciaMock({
        id: "denuncia-A",
        tipoObjeto: "resenia",
        objetoId: "resenia-1",
      }),
    });

    await service.resolverNoPedido(
      "moderador-1",
      "denuncia-A",
      datosResolver({ accion: "descartar" }),
    );

    expect(prisma.denuncia.updateMany).toHaveBeenCalledWith({
      where: { tipoObjeto: "resenia", objetoId: "resenia-1", estado: "pendiente" },
      data: { estado: "descartada", resueltaEn: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.resenia.update).not.toHaveBeenCalled();
  });

  it("Fix 4: descartar sobre resenia rechaza con conflicto si count da 0 (ya no quedaba ninguna denuncia pendiente sobre esa reseña)", async () => {
    const { service } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "resenia", objetoId: "resenia-1" }),
      denunciaUpdateManyCount: 0,
    });

    const error = await capturarError(
      service.resolverNoPedido("moderador-1", "denuncia-1", datosResolver({ accion: "descartar" })),
    );

    expect(error).toBeInstanceOf(ConflictException);
  });

  it("resolver sobre resenia: oculta TODAS las denuncias pendientes de esa misma reseña a la vez, la oculta permanentemente y recalcula el promedio del profesional, dentro de la misma transaccion (Fix 3)", async () => {
    const { service, prisma, tx } = crearServiceBase({
      denuncia: crearDenunciaMock({
        id: "denuncia-A",
        tipoObjeto: "resenia",
        objetoId: "resenia-1",
      }),
    });
    tx.resenia.findUnique.mockResolvedValue({ profesionalId: "perfil-resenia-1" });

    await service.resolverNoPedido(
      "moderador-1",
      "denuncia-A",
      datosResolver({ accion: "resolver" }),
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.denuncia.updateMany).toHaveBeenCalledWith({
      where: { tipoObjeto: "resenia", objetoId: "resenia-1", estado: "pendiente" },
      data: { estado: "resuelta", resueltaEn: expect.any(Date) },
    });
    expect(tx.resenia.update).toHaveBeenCalledWith({
      where: { id: "resenia-1" },
      data: { ocultaPorModeracionEn: expect.any(Date) },
    });
    // recalcularPromedioResenias(): aggregate excluyendo las ocultas + update del agregado.
    expect(tx.resenia.aggregate).toHaveBeenCalledWith({
      where: { profesionalId: "perfil-resenia-1", ocultaPorModeracionEn: null },
      _avg: { puntaje: true },
      _count: { _all: true },
    });
    expect(tx.perfilProfesional.update).toHaveBeenCalledWith({
      where: { id: "perfil-resenia-1" },
      data: { promedioResenias: 4, cantidadResenias: 3 },
    });
  });

  it("Fix 4: resolver sobre resenia rechaza con conflicto si otro moderador ya resolvio todas las denuncias pendientes (updateMany atomico dentro de la transaccion, count 0)", async () => {
    const { service, tx } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "resenia", objetoId: "resenia-1" }),
      txDenunciaUpdateManyCount: 0,
    });

    const error = await capturarError(
      service.resolverNoPedido("moderador-1", "denuncia-1", datosResolver({ accion: "resolver" })),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(tx.resenia.update).not.toHaveBeenCalled();
  });

  it("resolver sobre resenia: 404 si la reseña ya no existe (borrado entre denuncia y resolucion)", async () => {
    const { service, tx } = crearServiceBase({
      denuncia: crearDenunciaMock({ tipoObjeto: "resenia", objetoId: "resenia-1" }),
    });
    tx.resenia.findUnique.mockResolvedValue(null);

    const error = await capturarError(
      service.resolverNoPedido("moderador-1", "denuncia-1", datosResolver({ accion: "resolver" })),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(tx.resenia.update).not.toHaveBeenCalled();
  });
});
