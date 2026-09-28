import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { CrearCategoria, EditarBarrio, EditarCategoria } from "@fixeo/shared";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { CatalogoService } from "./catalogo.service.js";

/** Ejecuta una promesa que se espera rechazada y devuelve el error para inspeccionarlo. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa rechazara, pero se resolvio.");
}

function crearCategoriaMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "categoria-1",
    nombre: "Plomería",
    slug: "plomeria",
    subcategorias: [],
    preguntasGuia: [],
    requiereMatricula: "no_exigida",
    activa: true,
    ...overrides,
  };
}

function crearBarrioMock(overrides: Record<string, unknown> = {}) {
  return { id: "barrio-1", nombre: "Palermo", activo: true, ...overrides };
}

function crearService(
  options: {
    categoriaExistentePorSlug?: Record<string, unknown> | null;
    categoriaExistentePorId?: Record<string, unknown> | null;
    barrioExistente?: Record<string, unknown> | null;
  } = {},
) {
  const prisma = {
    categoria: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(null),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    barrio: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(
          options.barrioExistente === undefined ? crearBarrioMock() : options.barrioExistente,
        ),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  if (options.categoriaExistentePorSlug !== undefined) {
    prisma.categoria.findUnique.mockResolvedValueOnce(options.categoriaExistentePorSlug);
  }
  if (options.categoriaExistentePorId !== undefined) {
    prisma.categoria.findUnique.mockResolvedValue(options.categoriaExistentePorId);
  }

  const service = new CatalogoService(prisma as unknown as PrismaService);
  return { service, prisma };
}

function datosCrearCategoria(overrides: Partial<CrearCategoria> = {}): CrearCategoria {
  return {
    nombre: "Gas",
    slug: "gas",
    subcategorias: [],
    preguntasGuia: [],
    requiereMatricula: "obligatoria",
    ...overrides,
  };
}

describe("CatalogoService.crearCategoria", () => {
  it("rechaza con conflicto si ya existe una categoria con ese slug", async () => {
    const { service, prisma } = crearService({
      categoriaExistentePorSlug: crearCategoriaMock({ slug: "gas" }),
    });

    const error = await capturarError(service.crearCategoria(datosCrearCategoria({ slug: "gas" })));

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.categoria.create).not.toHaveBeenCalled();
  });

  it("crea la categoria activa cuando el slug esta libre", async () => {
    const { service, prisma } = crearService({ categoriaExistentePorSlug: null });
    prisma.categoria.create.mockResolvedValue(crearCategoriaMock({ slug: "gas", nombre: "Gas" }));

    await service.crearCategoria(datosCrearCategoria({ slug: "gas" }));

    expect(prisma.categoria.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "gas", activa: true }) }),
    );
  });
});

describe("CatalogoService.editarCategoria", () => {
  it("rechaza con 404 si la categoria no existe", async () => {
    const { service, prisma } = crearService({ categoriaExistentePorId: null });

    const error = await capturarError(
      service.editarCategoria("categoria-inexistente", {
        nombre: "Otro nombre",
      } as EditarCategoria),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.categoria.update).not.toHaveBeenCalled();
  });

  it("edita la categoria existente", async () => {
    const { service, prisma } = crearService({
      categoriaExistentePorId: crearCategoriaMock(),
    });
    prisma.categoria.update.mockResolvedValue(crearCategoriaMock({ nombre: "Plomería y gas" }));

    const vista = await service.editarCategoria("categoria-1", {
      nombre: "Plomería y gas",
    } as EditarCategoria);

    expect(prisma.categoria.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "categoria-1" },
        data: expect.objectContaining({ nombre: "Plomería y gas" }),
      }),
    );
    expect(vista.nombre).toBe("Plomería y gas");
  });
});

describe("CatalogoService.editarBarrio", () => {
  it("rechaza con 404 si el barrio no existe", async () => {
    const { service, prisma } = crearService({ barrioExistente: null });

    const error = await capturarError(
      service.editarBarrio("barrio-inexistente", { activo: false } as EditarBarrio),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.barrio.update).not.toHaveBeenCalled();
  });

  it("activa o desactiva el barrio existente (D10), sin migracion ni deploy", async () => {
    const { service, prisma } = crearService({
      barrioExistente: crearBarrioMock({ activo: true }),
    });
    prisma.barrio.update.mockResolvedValue(crearBarrioMock({ activo: false }));

    const vista = await service.editarBarrio("barrio-1", { activo: false } as EditarBarrio);

    expect(prisma.barrio.update).toHaveBeenCalledWith({
      where: { id: "barrio-1" },
      data: { activo: false },
    });
    expect(vista.activo).toBe(false);
  });
});
