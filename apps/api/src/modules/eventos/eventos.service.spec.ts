import { describe, expect, it, jest } from "@jest/globals";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { EventosService } from "./eventos.service.js";

function crearService(
  options: {
    categoria?: { slug: string } | null;
    barrio?: { nombre: string } | null;
  } = {},
) {
  const prisma = {
    eventoAnalitico: { create: jest.fn<(args: unknown) => Promise<unknown>>() },
    categoria: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ slug: string } | null>>()
        .mockResolvedValue(options.categoria ?? null),
    },
    barrio: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ nombre: string } | null>>()
        .mockResolvedValue(options.barrio ?? null),
    },
  };
  const service = new EventosService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe("EventosService.registrar", () => {
  it("guarda el evento con categoria, zona y rol (docs/dominio.md §10)", async () => {
    const { service, prisma } = crearService();

    await service.registrar({
      tipo: "pedido_publicado",
      categoria: "plomeria",
      zona: "Palermo",
      rol: "cliente",
      usuarioId: "usuario-1",
      pedidoId: "pedido-1",
    });

    expect(prisma.eventoAnalitico.create).toHaveBeenCalledWith({
      data: {
        tipo: "pedido_publicado",
        categoria: "plomeria",
        zona: "Palermo",
        rol: "cliente",
        usuarioId: "usuario-1",
        pedidoId: "pedido-1",
        metadata: undefined,
      },
    });
  });

  it("completa con null las dimensiones que no llegan (eventos del asistente, todavia sin barrio ni pedido)", async () => {
    const { service, prisma } = crearService();

    await service.registrar({ tipo: "asistente_iniciado" });

    expect(prisma.eventoAnalitico.create).toHaveBeenCalledWith({
      data: {
        tipo: "asistente_iniciado",
        categoria: null,
        zona: null,
        rol: null,
        usuarioId: null,
        pedidoId: null,
        metadata: undefined,
      },
    });
  });
});

describe("EventosService.registrarDelCliente", () => {
  it("resuelve categoriaId/barrioId contra el catalogo, nunca guarda texto libre del cliente", async () => {
    const { service, prisma } = crearService({
      categoria: { slug: "plomeria" },
      barrio: { nombre: "Palermo" },
    });

    await service.registrarDelCliente({
      tipo: "asistente_paso_completado",
      categoriaId: "categoria-1",
      barrioId: "barrio-1",
      paso: "donde",
    });

    expect(prisma.categoria.findUnique).toHaveBeenCalledWith({
      where: { id: "categoria-1" },
      select: { slug: true },
    });
    expect(prisma.eventoAnalitico.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        categoria: "plomeria",
        zona: "Palermo",
        rol: "cliente",
        metadata: { paso: "donde" },
      }),
    });
  });

  it("guarda null en vez de fallar si el id no corresponde a nada real", async () => {
    const { service, prisma } = crearService({ categoria: null, barrio: null });

    await service.registrarDelCliente({ tipo: "asistente_iniciado" });

    expect(prisma.categoria.findUnique).not.toHaveBeenCalled();
    expect(prisma.eventoAnalitico.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoria: null, zona: null, metadata: undefined }),
    });
  });
});
