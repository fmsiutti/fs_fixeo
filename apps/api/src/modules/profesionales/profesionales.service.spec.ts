import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { GuardarOficios, ZonaCoberturaInput } from "@fixeo/shared";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { ProfesionalesService } from "./profesionales.service.js";

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

function crearCategoria(overrides: Partial<{ id: string; requiereMatricula: string }> = {}) {
  return {
    id: "categoria-1",
    nombre: "Plomería",
    slug: "plomeria",
    requiereMatricula: "no_exigida",
    activa: true,
    ...overrides,
  };
}

function crearService(
  options: {
    perfil?: { id: string; usuarioId: string } | null;
    categorias?: ReturnType<typeof crearCategoria>[];
    oficiosExistentes?: { id: string; categoriaId: string }[];
    barrios?: { id: string }[];
    verificacionesAsociadas?: number;
  } = {},
) {
  const tx = {
    oficioProfesional: {
      findMany: jest.fn<(args: unknown) => Promise<{ id: string; categoriaId: string }[]>>(),
      deleteMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
      create: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    verificacion: {
      count: jest.fn<(args: unknown) => Promise<number>>(),
    },
  };
  tx.oficioProfesional.findMany.mockResolvedValue(options.oficiosExistentes ?? []);
  tx.oficioProfesional.deleteMany.mockResolvedValue({ count: 0 });
  tx.verificacion.count.mockResolvedValue(options.verificacionesAsociadas ?? 0);

  const perfil =
    options.perfil === undefined ? { id: "perfil-1", usuarioId: "usuario-1" } : options.perfil;

  const prisma = {
    perfilProfesional: {
      findUnique: jest.fn<(args: unknown) => Promise<typeof perfil>>().mockResolvedValue(perfil),
    },
    categoria: {
      findMany: jest
        .fn<(args: unknown) => Promise<ReturnType<typeof crearCategoria>[]>>()
        .mockResolvedValue(options.categorias ?? [crearCategoria()]),
    },
    barrio: {
      findMany: jest
        .fn<(args: unknown) => Promise<{ id: string }[]>>()
        .mockResolvedValue(options.barrios ?? []),
    },
    zonaCobertura: { upsert: jest.fn<(args: unknown) => Promise<unknown>>() },
    $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

  const service = new ProfesionalesService(prisma as unknown as PrismaService);
  // obtenerPropio se llama al final de cada metodo: se le pisa el mock para
  // no tener que armar el include completo en cada test (ya tiene su propio
  // spec en profesionales.vistas.spec.ts).
  const obtenerPropioMock = jest
    .spyOn(service, "obtenerPropio")
    .mockResolvedValue({} as Awaited<ReturnType<typeof service.obtenerPropio>>);

  return { service, prisma, tx, obtenerPropioMock };
}

describe("ProfesionalesService.guardarOficios", () => {
  it("404 si el usuario todavia no armo su perfil profesional", async () => {
    const { service } = crearService({ perfil: null });

    await expect(
      service.guardarOficios("usuario-1", { oficios: [] } as GuardarOficios),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("un oficio nuevo en una categoria sin matricula arranca en no_requerida", async () => {
    const { service, tx } = crearService({
      categorias: [crearCategoria({ requiereMatricula: "no_exigida" })],
    });

    await service.guardarOficios("usuario-1", {
      oficios: [{ categoriaId: "categoria-1", subcategorias: [] }],
    } as GuardarOficios);

    expect(tx.oficioProfesional.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matriculaEstado: "no_requerida" }),
      }),
    );
  });

  it("un oficio nuevo en una categoria con matricula obligatoria arranca en pendiente", async () => {
    const { service, tx } = crearService({
      categorias: [crearCategoria({ requiereMatricula: "obligatoria" })],
    });

    await service.guardarOficios("usuario-1", {
      oficios: [{ categoriaId: "categoria-1", subcategorias: [] }],
    } as GuardarOficios);

    expect(tx.oficioProfesional.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matriculaEstado: "pendiente" }),
      }),
    );
  });

  // D9 (docs/dominio.md §12): "recomendada" (aire acondicionado) no es
  // "obligatoria" (gas, electricidad): no bloquea nada de entrada, asi que
  // arranca igual que "no_exigida" y solo sube a "pendiente" cuando el
  // profesional efectivamente sube un documento de matricula
  // (VerificacionesService.subirDocumento).
  it("un oficio nuevo en una categoria con matricula recomendada arranca en no_requerida", async () => {
    const { service, tx } = crearService({
      categorias: [crearCategoria({ requiereMatricula: "recomendada" })],
    });

    await service.guardarOficios("usuario-1", {
      oficios: [{ categoriaId: "categoria-1", subcategorias: [] }],
    } as GuardarOficios);

    expect(tx.oficioProfesional.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ matriculaEstado: "no_requerida" }),
      }),
    );
  });

  it("un oficio que ya existia solo actualiza subcategorias, nunca su matriculaEstado", async () => {
    const { service, tx } = crearService({
      oficiosExistentes: [{ id: "oficio-1", categoriaId: "categoria-1" }],
    });

    await service.guardarOficios("usuario-1", {
      oficios: [{ categoriaId: "categoria-1", subcategorias: ["Nueva subcategoria"] }],
    } as GuardarOficios);

    expect(tx.oficioProfesional.update).toHaveBeenCalledWith({
      where: { id: "oficio-1" },
      data: { subcategorias: ["Nueva subcategoria"] },
    });
    expect(tx.oficioProfesional.create).not.toHaveBeenCalled();
  });

  it("borra los oficios que ya no vienen en el set nuevo", async () => {
    const { service, tx } = crearService({
      oficiosExistentes: [{ id: "oficio-viejo", categoriaId: "categoria-vieja" }],
      categorias: [crearCategoria()],
    });

    await service.guardarOficios("usuario-1", {
      oficios: [{ categoriaId: "categoria-1", subcategorias: [] }],
    } as GuardarOficios);

    expect(tx.oficioProfesional.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["oficio-viejo"] } },
    });
  });

  it("conflicto si se quita un oficio con una verificacion asociada, sin guardar nada mas", async () => {
    const { service, tx } = crearService({
      oficiosExistentes: [{ id: "oficio-viejo", categoriaId: "categoria-vieja" }],
      categorias: [crearCategoria()],
      verificacionesAsociadas: 1,
    });

    await expect(
      service.guardarOficios("usuario-1", {
        oficios: [{ categoriaId: "categoria-1", subcategorias: [] }],
      } as GuardarOficios),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.oficioProfesional.deleteMany).not.toHaveBeenCalled();
    expect(tx.oficioProfesional.create).not.toHaveBeenCalled();
  });

  it("404 si alguna categoria elegida no existe o esta inactiva", async () => {
    const { service } = crearService({ categorias: [] });

    await expect(
      service.guardarOficios("usuario-1", {
        oficios: [{ categoriaId: "categoria-inexistente", subcategorias: [] }],
      } as GuardarOficios),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ProfesionalesService.guardarZona", () => {
  it("404 si el usuario todavia no armo su perfil profesional", async () => {
    const { service } = crearService({ perfil: null });

    await expect(
      service.guardarZona("usuario-1", {
        tipo: "radio",
        centroLat: -34.6,
        centroLng: -58.45,
        radioKm: 5,
      } as ZonaCoberturaInput),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404 si algun barrio elegido no existe", async () => {
    const { service } = crearService({ barrios: [] });

    await expect(
      service.guardarZona("usuario-1", {
        tipo: "barrios",
        barrioIds: ["barrio-inexistente"],
      } as ZonaCoberturaInput),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("guarda zona por radio con los campos de barrios en null", async () => {
    const { service, prisma } = crearService();

    await service.guardarZona("usuario-1", {
      tipo: "radio",
      centroLat: -34.6,
      centroLng: -58.45,
      radioKm: 5,
    } as ZonaCoberturaInput);

    expect(prisma.zonaCobertura.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { perfilId: "perfil-1" },
        create: expect.objectContaining({
          tipo: "radio",
          barrioIds: [],
          centroLat: -34.6,
          centroLng: -58.45,
          radioKm: 5,
        }),
      }),
    );
  });
});
