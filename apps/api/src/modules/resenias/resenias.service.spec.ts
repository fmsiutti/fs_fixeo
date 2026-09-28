import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { ReseniasService } from "./resenias.service.js";

/** Ejecuta una promesa que se espera rechazada y devuelve el error para inspeccionarlo. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa rechazara, pero se resolvio.");
}

function crearReseniaMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "resenia-1",
    profesionalId: "perfil-1",
    respuestaProfesional: null as string | null,
    cliente: { nombre: "María", apellido: "Gómez" },
    pedido: { categoria: { nombre: "Plomería", slug: "plomeria" } },
    profesional: { usuarioId: "usuario-profesional-1" },
    puntaje: 5,
    atributos: ["puntual"],
    comentario: "Excelente",
    publicadaEn: new Date("2026-01-10T00:00:00.000Z"),
    montoDeclarado: 15000,
    ...overrides,
  };
}

describe("ReseniasService.responder", () => {
  function crearService(
    options: {
      resenia?: Record<string, unknown> | null;
      reseniaActualizada?: Record<string, unknown>;
    } = {},
  ) {
    const prisma = {
      resenia: {
        findUnique: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(options.resenia === undefined ? crearReseniaMock() : options.resenia),
        update: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(
            options.reseniaActualizada ??
              crearReseniaMock({ respuestaProfesional: "Gracias por la reseña" }),
          ),
      },
      perfilProfesional: {
        findUnique: jest.fn<(args: unknown) => Promise<unknown>>(),
      },
    };
    const service = new ReseniasService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  it("el profesional dueño puede responder una vez", async () => {
    const { service, prisma } = crearService();

    const vista = await service.responder("usuario-profesional-1", "resenia-1", "Gracias!");

    expect(prisma.resenia.update).toHaveBeenCalledWith({
      where: { id: "resenia-1" },
      data: { respuestaProfesional: "Gracias!" },
      include: expect.objectContaining({
        cliente: expect.anything(),
        pedido: expect.anything(),
      }),
    });
    expect(vista.respuestaProfesional).toBe("Gracias por la reseña");
  });

  it("rechaza con conflicto si la reseña ya tiene una respuesta", async () => {
    const { service, prisma } = crearService({
      resenia: crearReseniaMock({ respuestaProfesional: "Ya respondi" }),
    });

    const error = await capturarError(
      service.responder("usuario-profesional-1", "resenia-1", "Otra respuesta"),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.resenia.update).not.toHaveBeenCalled();
  });

  it("rechaza con 404 si el usuario no es el dueño del perfil de esa reseña", async () => {
    const { service, prisma } = crearService({
      resenia: crearReseniaMock({ profesional: { usuarioId: "otro-usuario" } }),
    });

    const error = await capturarError(
      service.responder("usuario-profesional-1", "resenia-1", "Gracias!"),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.resenia.update).not.toHaveBeenCalled();
  });

  it("rechaza con 404 si la reseña no existe", async () => {
    const { service, prisma } = crearService({ resenia: null });

    const error = await capturarError(
      service.responder("usuario-profesional-1", "resenia-1", "Gracias!"),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.resenia.update).not.toHaveBeenCalled();
  });
});

describe("ReseniasService.listarDeProfesional", () => {
  function crearReseniasPagina(cantidad: number, offset = 0) {
    return Array.from({ length: cantidad }, (_, indice) =>
      crearReseniaMock({
        id: `resenia-${offset + indice + 1}`,
        publicadaEn: new Date(2026, 0, 20 - (offset + indice)),
      }),
    );
  }

  function crearService(options: {
    perfil?: { id: string } | null;
    resultadosPorCursor?: Record<string | "sin-cursor", Record<string, unknown>[]>;
    // IDs que una denuncia pendiente de motivo grave oculta dinamicamente
    // (docs/dominio.md §8, D14). Vacio por default: ninguna reseña queda
    // oculta por esta via.
    idsOcultosPorDenuncia?: string[];
    // Sugerencia C (code review slice 9): ids de TODAS las reseñas de este
    // profesional, que el service pide antes de acotar la query de denuncias
    // graves por `objetoId: { in: ... }`. Un stub no vacio por default
    // alcanza para la mayoria de los tests (solo importa que la query de
    // denuncias se dispare); pasar `[]` explicito simula un profesional sin
    // ninguna reseña, donde ni hace falta consultar denuncias.
    idsReseniasDelProfesional?: string[];
  }) {
    const prisma = {
      perfilProfesional: {
        findUnique: jest
          .fn<(args: unknown) => Promise<unknown>>()
          .mockResolvedValue(options.perfil === undefined ? { id: "perfil-1" } : options.perfil),
      },
      resenia: {
        findMany: jest.fn<
          (args: {
            cursor?: { id: string };
            select?: Record<string, boolean>;
          }) => Promise<unknown[]>
        >((args) => {
          // La query de "ids de reseñas de este profesional" (Sugerencia C)
          // pide solo `select: { id: true }`, sin cursor; la de listado
          // paginado usa `include`. Se distinguen por `select`.
          if (args?.select) {
            return Promise.resolve(
              (options.idsReseniasDelProfesional ?? ["resenia-stub"]).map((id) => ({ id })),
            );
          }
          const clave = args?.cursor?.id ?? "sin-cursor";
          return Promise.resolve(options.resultadosPorCursor?.[clave] ?? []);
        }),
      },
      // Sin denuncias pendientes por default: ninguna reseña queda oculta
      // (ReseniasService.listarDeProfesional consulta esto antes de traer las
      // reseñas, ver docs/dominio.md §8).
      denuncia: {
        findMany: jest
          .fn<(args: unknown) => Promise<unknown[]>>()
          .mockResolvedValue(
            (options.idsOcultosPorDenuncia ?? []).map((objetoId) => ({ objetoId })),
          ),
      },
    };
    const service = new ReseniasService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  it("rechaza con 404 si el profesional no existe", async () => {
    const { service } = crearService({ perfil: null });

    const error = await capturarError(service.listarDeProfesional("perfil-1"));

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("la vista nunca incluye montoDeclarado ni datos crudos de Prisma", async () => {
    const { service } = crearService({
      resultadosPorCursor: { "sin-cursor": [crearReseniaMock({ montoDeclarado: 99999 })] },
    });

    const pagina = await service.listarDeProfesional("perfil-1");

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0]).not.toHaveProperty("montoDeclarado");
    expect(JSON.stringify(pagina.items[0])).not.toContain("99999");
  });

  it("ordena por fecha descendente (mas nuevas primero)", async () => {
    const { service, prisma } = crearService({
      resultadosPorCursor: { "sin-cursor": crearReseniasPagina(3) },
    });

    await service.listarDeProfesional("perfil-1");

    expect(prisma.resenia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ publicadaEn: "desc" }, { id: "desc" }] }),
    );
  });

  describe("ocultamiento (docs/dominio.md §8, D14: dinamico + permanente)", () => {
    it("siempre excluye las ocultas permanentemente (ocultaPorModeracionEn no nulo), sin denuncias pendientes", async () => {
      const { service, prisma } = crearService({
        resultadosPorCursor: { "sin-cursor": [] },
        idsOcultosPorDenuncia: [],
      });

      await service.listarDeProfesional("perfil-1");

      expect(prisma.resenia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ocultaPorModeracionEn: null }),
        }),
      );
      // Sin nada oculto dinamicamente, el where no agrega un "notIn" vacio.
      const argumentos = (prisma.resenia.findMany.mock.calls[0]?.[0] ?? {}) as {
        where?: Record<string, unknown>;
      };
      expect(argumentos.where).not.toHaveProperty("id");
    });

    it("combina el ocultamiento dinamico (denuncia pendiente grave) con el permanente en el mismo where", async () => {
      const { service, prisma } = crearService({
        resultadosPorCursor: { "sin-cursor": [] },
        idsOcultosPorDenuncia: ["resenia-oculta-1", "resenia-oculta-2"],
      });

      await service.listarDeProfesional("perfil-1");

      expect(prisma.resenia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ocultaPorModeracionEn: null,
            id: { notIn: ["resenia-oculta-1", "resenia-oculta-2"] },
          }),
        }),
      );
    });

    it("una reseña con denuncia pendiente grave Y oculta permanentemente sigue sin aparecer (las dos vias filtran)", async () => {
      // La reseña permanentemente oculta nunca esta en el resultado de
      // Prisma (el where real la excluye): el mock ya modela eso devolviendo
      // una pagina vacia aunque tambien este en idsOcultosPorDenuncia.
      const { service, prisma } = crearService({
        resultadosPorCursor: { "sin-cursor": [] },
        idsOcultosPorDenuncia: ["resenia-doble-ocultamiento"],
      });

      const pagina = await service.listarDeProfesional("perfil-1");

      expect(pagina.items).toHaveLength(0);
      expect(prisma.resenia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ocultaPorModeracionEn: null,
            id: { notIn: ["resenia-doble-ocultamiento"] },
          }),
        }),
      );
    });

    it("una reseña sin denuncia pendiente ni ocultamiento permanente se muestra (caso base)", async () => {
      const { service } = crearService({
        resultadosPorCursor: { "sin-cursor": [crearReseniaMock({ id: "resenia-visible" })] },
        idsOcultosPorDenuncia: [],
      });

      const pagina = await service.listarDeProfesional("perfil-1");

      expect(pagina.items.map((item) => item.id)).toEqual(["resenia-visible"]);
    });

    it("un profesional sin ninguna reseña no consulta denuncias (Sugerencia C: la query de denuncias graves se acota a sus propias reseñas)", async () => {
      const { service, prisma } = crearService({
        resultadosPorCursor: { "sin-cursor": [] },
        idsReseniasDelProfesional: [],
      });

      const pagina = await service.listarDeProfesional("perfil-1");

      expect(pagina.items).toHaveLength(0);
      expect(prisma.denuncia.findMany).not.toHaveBeenCalled();
    });
  });

  it("la paginacion por cursor no repite filas entre paginas", async () => {
    // 21 resenias en total: la primera pagina de 20 pide take 21, devuelve 21
    // (hayMas=true), recorta a 20 y usa la fila 20 como cursor de la
    // siguiente pagina, que trae la fila 21 restante.
    const primeraTanda = crearReseniasPagina(21, 0);
    const segundaTanda = [
      crearReseniaMock({ id: "resenia-22", publicadaEn: new Date(2025, 11, 1) }),
    ];
    const { service } = crearService({
      resultadosPorCursor: {
        "sin-cursor": primeraTanda,
        "resenia-20": segundaTanda,
      },
    });

    const primeraPagina = await service.listarDeProfesional("perfil-1");
    expect(primeraPagina.items).toHaveLength(20);
    expect(primeraPagina.cursor).toBe("resenia-20");
    expect(primeraPagina.items.some((item) => item.id === "resenia-21")).toBe(false);

    const segundaPagina = await service.listarDeProfesional(
      "perfil-1",
      primeraPagina.cursor ?? undefined,
    );
    expect(segundaPagina.items).toHaveLength(1);
    expect(segundaPagina.items[0]?.id).toBe("resenia-22");
    expect(segundaPagina.cursor).toBeNull();
    // Ninguna fila de la primera pagina aparece de nuevo en la segunda.
    const idsPrimeraPagina = new Set(primeraPagina.items.map((item) => item.id));
    for (const item of segundaPagina.items) {
      expect(idsPrimeraPagina.has(item.id)).toBe(false);
    }
  });
});
