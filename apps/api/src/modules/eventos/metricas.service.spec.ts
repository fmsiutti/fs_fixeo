import { describe, expect, it, jest } from "@jest/globals";
import type { MetricasQuery } from "@fixeo/shared";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { MetricasService } from "./metricas.service.js";

interface PedidoFixture {
  id: string;
  publicadoEn: Date | null;
  cantidadPostulaciones: number;
  cantidadContactos: number;
  desenlace: string | null;
}

interface PostulacionFixture {
  pedidoId: string;
  enviadaEn: Date;
}

const CATEGORIA_PLOMERIA = { id: "categoria-plomeria", nombre: "Plomería", slug: "plomeria" };
const CATEGORIA_GAS = { id: "categoria-gas", nombre: "Gas", slug: "gas" };

function crearService(
  options: {
    pedidos?: PedidoFixture[];
    postulaciones?: PostulacionFixture[];
    categorias?: { id: string; nombre: string; slug: string }[];
    iniciados?: number;
    publicados?: number;
  } = {},
) {
  const pedidos = options.pedidos ?? [];
  const postulaciones = options.postulaciones ?? [];
  const categorias = options.categorias ?? [];

  const prisma = {
    pedido: {
      // Filtra por categoriaId como haria Prisma de verdad: calcularPorCategoria
      // llama a calcularMetricas una vez por categoria con ese filtro, y
      // porCategoria depende de que cada llamada solo vea sus propios pedidos.
      findMany: jest.fn<(args: unknown) => Promise<PedidoFixture[]>>((args) => {
        const categoriaId = (args as { where?: { categoriaId?: string } })?.where?.categoriaId;
        if (!categoriaId) return Promise.resolve(pedidos);
        const idsDeLaCategoria = (
          categoriaId === CATEGORIA_PLOMERIA.id
            ? pedidos.filter((p) => p.id.startsWith("plomeria"))
            : pedidos.filter((p) => p.id.startsWith("gas"))
        ) as PedidoFixture[];
        return Promise.resolve(idsDeLaCategoria);
      }),
    },
    postulacion: {
      findMany: jest.fn<(args: unknown) => Promise<PostulacionFixture[]>>((args) => {
        const idsPedidos = new Set(
          (args as { where?: { pedidoId?: { in?: string[] } } })?.where?.pedidoId?.in ?? [],
        );
        return Promise.resolve(postulaciones.filter((p) => idsPedidos.has(p.pedidoId)));
      }),
    },
    categoria: {
      findMany: jest
        .fn<(args: unknown) => Promise<{ id: string; nombre: string; slug: string }[]>>()
        .mockResolvedValue(categorias),
      findUnique: jest
        .fn<(args: unknown) => Promise<{ slug: string } | null>>()
        .mockResolvedValue(null),
    },
    barrio: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ nombre: string } | null>>()
        .mockResolvedValue(null),
    },
    eventoAnalitico: {
      count: jest
        .fn<(args: unknown) => Promise<number>>()
        .mockImplementation((args) =>
          Promise.resolve(
            (args as { where?: { tipo?: string } })?.where?.tipo === "asistente_iniciado"
              ? (options.iniciados ?? 0)
              : (options.publicados ?? 0),
          ),
        ),
    },
  };

  const service = new MetricasService(prisma as unknown as PrismaService);
  return { service, prisma };
}

function query(overrides: Partial<MetricasQuery> = {}): MetricasQuery {
  return {
    desde: new Date("2026-01-01T00:00:00.000Z"),
    hasta: new Date("2026-01-31T00:00:00.000Z"),
    ...overrides,
  };
}

describe("MetricasService.obtenerTablero", () => {
  it("sin pedidos publicados en el rango: todas las tasas son null, totalPedidosPublicados es 0 (nunca NaN), y porCategoria se sigue calculando", async () => {
    const { service } = crearService({
      pedidos: [],
      categorias: [CATEGORIA_PLOMERIA, CATEGORIA_GAS],
    });

    const tablero = await service.obtenerTablero(query());

    expect(tablero.totalPedidosPublicados).toBe(0);
    expect(tablero.coberturaSeisHorasPorcentaje).toBeNull();
    expect(tablero.medianaMinutosPrimeraPostulacion).toBeNull();
    expect(tablero.tasaContactoPorcentaje).toBeNull();
    expect(tablero.tasaTrabajoDeclaradoPorcentaje).toBeNull();
    expect(tablero.tasaSeleccionMedianaPorcentaje).toBeNull();
    expect(tablero.finalizacionAsistentePorcentaje).toBeNull();
    // No se saltea el desglose por categoria aunque el total global sea cero.
    expect(tablero.porCategoria).toHaveLength(2);
    expect(tablero.porCategoria.every((fila) => fila.totalPedidosPublicados === 0)).toBe(true);
    for (const fila of tablero.porCategoria) {
      expect(fila.coberturaSeisHorasPorcentaje).toBeNull();
      expect(Number.isNaN(fila.totalPedidosPublicados)).toBe(false);
    }
  });

  it("cobertura de 6 h: cuenta la primera postulacion justo al limite, no la que llega un instante despues", async () => {
    const publicadoEn = new Date("2026-01-10T00:00:00.000Z");
    const { service } = crearService({
      pedidos: [
        {
          id: "pedido-al-limite",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
        {
          id: "pedido-pasado",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
      ],
      postulaciones: [
        // Exactamente 6 h despues: <= SEIS_HORAS_MS, cuenta como cubierto.
        {
          pedidoId: "pedido-al-limite",
          enviadaEn: new Date(publicadoEn.getTime() + 6 * 60 * 60 * 1000),
        },
        // 6 h y 1 segundo despues: ya no cuenta.
        {
          pedidoId: "pedido-pasado",
          enviadaEn: new Date(publicadoEn.getTime() + 6 * 60 * 60 * 1000 + 1000),
        },
      ],
    });

    const tablero = await service.obtenerTablero(query());

    expect(tablero.coberturaSeisHorasPorcentaje).toBe(50);
  });

  it("mediana con cantidad par de valores: promedia los dos del medio", async () => {
    const publicadoEn = new Date("2026-01-10T00:00:00.000Z");
    const { service } = crearService({
      pedidos: [
        {
          id: "pedido-1",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
        {
          id: "pedido-2",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
      ],
      postulaciones: [
        { pedidoId: "pedido-1", enviadaEn: new Date(publicadoEn.getTime() + 10 * 60_000) },
        { pedidoId: "pedido-2", enviadaEn: new Date(publicadoEn.getTime() + 30 * 60_000) },
      ],
    });

    const tablero = await service.obtenerTablero(query());

    expect(tablero.medianaMinutosPrimeraPostulacion).toBe(20);
  });

  it("mediana con cantidad impar de valores: el del medio, no un promedio", async () => {
    const publicadoEn = new Date("2026-01-10T00:00:00.000Z");
    const { service } = crearService({
      pedidos: [
        {
          id: "pedido-1",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
        {
          id: "pedido-2",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
        {
          id: "pedido-3",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
      ],
      postulaciones: [
        { pedidoId: "pedido-1", enviadaEn: new Date(publicadoEn.getTime() + 5 * 60_000) },
        { pedidoId: "pedido-2", enviadaEn: new Date(publicadoEn.getTime() + 100 * 60_000) },
        { pedidoId: "pedido-3", enviadaEn: new Date(publicadoEn.getTime() + 15 * 60_000) },
      ],
    });

    const tablero = await service.obtenerTablero(query());

    expect(tablero.medianaMinutosPrimeraPostulacion).toBe(15);
  });

  it("porCategoria respeta el filtro de categoria de la query: da como mucho una fila", async () => {
    const { service, prisma } = crearService({
      pedidos: [
        {
          id: "plomeria-1",
          publicadoEn: new Date(),
          cantidadPostulaciones: 2,
          cantidadContactos: 1,
          desenlace: null,
        },
        {
          id: "gas-1",
          publicadoEn: new Date(),
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
      ],
      categorias: [CATEGORIA_PLOMERIA],
    });

    const tablero = await service.obtenerTablero(query({ categoriaId: CATEGORIA_PLOMERIA.id }));

    expect(prisma.categoria.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activa: true, id: CATEGORIA_PLOMERIA.id } }),
    );
    expect(tablero.porCategoria).toHaveLength(1);
    expect(tablero.porCategoria[0]?.categoria.id).toBe(CATEGORIA_PLOMERIA.id);
  });

  it("tasa de contacto y trabajo declarado, sobre pedidos con datos mixtos", async () => {
    const publicadoEn = new Date("2026-01-10T00:00:00.000Z");
    const { service } = crearService({
      pedidos: [
        {
          id: "pedido-1",
          publicadoEn,
          cantidadPostulaciones: 2,
          cantidadContactos: 1,
          desenlace: "lo_hizo_este_profesional",
        },
        {
          id: "pedido-2",
          publicadoEn,
          cantidadPostulaciones: 1,
          cantidadContactos: 0,
          desenlace: null,
        },
      ],
    });

    const tablero = await service.obtenerTablero(query());

    expect(tablero.tasaContactoPorcentaje).toBe(50);
    expect(tablero.tasaTrabajoDeclaradoPorcentaje).toBe(50);
  });
});
