import { describe, expect, it, jest } from "@jest/globals";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { CerrarPedido } from "@fixeo/shared";
import type { EventosService } from "../eventos/eventos.service.js";
import type { ParametrosService } from "../parametros/parametros.service.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { Prisma } from "../../generated/prisma/client.js";
import { PedidosCierreService } from "./pedidos-cierre.service.js";

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

function crearPedidoBase(overrides: Record<string, unknown> = {}) {
  return {
    id: "pedido-1",
    clienteId: "cliente-1",
    estado: "contacto_habilitado",
    desenlacePostergado: false,
    cierreAutomaticoEn: new Date("2026-01-15T00:00:00.000Z"),
    categoria: { slug: "plomeria" },
    barrio: { nombre: "Palermo" },
    ...overrides,
  };
}

function crearPedidoActualizadoMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "pedido-1",
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategoria: null,
    descripcion: "Se rompio la canilla de la cocina",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    direccion: {
      calle: "Av. Siempreviva",
      numero: "742",
      piso: null,
      depto: null,
      tipoPropiedad: "casa",
      lat: -34.6,
      lng: -58.4,
    },
    barrio: { id: "barrio-1", nombre: "Palermo" },
    estado: "cerrado",
    publicadoEn: new Date("2026-01-01T00:00:00.000Z"),
    expiraEn: new Date("2026-01-08T00:00:00.000Z"),
    cierreAutomaticoEn: new Date("2026-01-15T00:00:00.000Z"),
    desenlace: "lo_hizo_este_profesional",
    desenlacePostergado: false,
    fotos: [],
    vistas: 0,
    cantidadPostulaciones: 3,
    cantidadContactos: 1,
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function crearContactoMock(overrides: Record<string, unknown> = {}) {
  return {
    id: "contacto-1",
    pedidoId: "pedido-1",
    postulacion: { profesionalId: "perfil-1" },
    ...overrides,
  };
}

function crearParametrosMock(overrides: Partial<Record<string, number>> = {}): ParametrosService {
  const valores: Record<string, number> = {
    seleccionables_max_por_pedido: 3,
    postulaciones_max_por_pedido: 8,
    postergacion_desenlace_dias: 7,
    ...overrides,
  };
  return {
    getNumero: jest.fn((clave: string) => Promise.resolve(valores[clave])),
    getTexto: jest.fn(),
  } as unknown as ParametrosService;
}

function crearService(
  options: {
    pedidoExistente?: Record<string, unknown> | null;
    contacto?: Record<string, unknown> | null;
    pedidoActualizado?: Record<string, unknown>;
    parametros?: Partial<Record<string, number>>;
    updateManyPostergarCount?: number;
    resenieCreateError?: unknown;
    // docs/dominio.md §4 (D2): postulaciones que seguian enviada/vista al
    // momento de cerrar. Vacio por defecto: la mayoria de los tests de este
    // archivo no le interesa la caducacion, solo el que la prueba explicitamente.
    postulacionesAbiertas?: { id: string; estado: string }[];
  } = {},
) {
  const tx = {
    resenia: {
      create: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ id: "resenia-1" }),
      aggregate: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue({ _avg: { puntaje: 5 }, _count: { _all: 1 } }),
    },
    perfilProfesional: {
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue(undefined),
    },
    contacto: {
      findUnique: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(options.contacto === undefined ? crearContactoMock() : options.contacto),
    },
    // Usado por transicionar() de pedidos.estados.ts (-> cerrado) y por
    // caducarPostulacionesAbiertas() de postulaciones.estados.ts (-> caducada).
    pedido: {
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
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
        .mockResolvedValue({ id: "postulacion-1", estado: "caducada" }),
    },
  };

  if (options.resenieCreateError) {
    tx.resenia.create.mockRejectedValue(options.resenieCreateError);
  }

  const prisma = {
    pedido: {
      findUnique: jest
        .fn<(args: unknown) => Promise<Record<string, unknown> | null>>()
        .mockResolvedValue(
          options.pedidoExistente === undefined ? crearPedidoBase() : options.pedidoExistente,
        ),
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<unknown>>()
        .mockResolvedValue(options.pedidoActualizado ?? crearPedidoActualizadoMock()),
      updateMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: options.updateManyPostergarCount ?? 1 }),
    },
    $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

  const parametros = crearParametrosMock(options.parametros);
  const eventos = {
    registrar: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as EventosService;

  const service = new PedidosCierreService(prisma as unknown as PrismaService, parametros, eventos);
  return { service, prisma, tx, parametros, eventos };
}

function datosCerrar(overrides: Partial<CerrarPedido> = {}): CerrarPedido {
  return { desenlace: "lo_hizo_otro", ...overrides } as CerrarPedido;
}

describe("PedidosCierreService.cerrar", () => {
  it("rechaza con 404 si el pedido no existe", async () => {
    const { service, prisma } = crearService({ pedidoExistente: null });

    const error = await capturarError(service.cerrar("cliente-1", "pedido-1", datosCerrar()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza con 404 si el pedido no es del cliente dueno", async () => {
    const { service, prisma } = crearService({
      pedidoExistente: crearPedidoBase({ clienteId: "otro-cliente" }),
    });

    const error = await capturarError(service.cerrar("cliente-1", "pedido-1", datosCerrar()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rechaza con conflicto si el pedido no esta en contacto_habilitado", async () => {
    const { service, prisma } = crearService({
      pedidoExistente: crearPedidoBase({ estado: "publicado" }),
    });

    const error = await capturarError(service.cerrar("cliente-1", "pedido-1", datosCerrar()));

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('desenlace "todavia_no_lo_resolvi"', () => {
    it("posterga cierreAutomaticoEn desde el valor actual (no desde ahora), marca desenlacePostergado, y no cambia el estado", async () => {
      const { service, prisma } = crearService({
        pedidoExistente: crearPedidoBase({
          cierreAutomaticoEn: new Date("2026-01-15T00:00:00.000Z"),
        }),
      });

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({ desenlace: "todavia_no_lo_resolvi" }),
      );

      expect(prisma.pedido.updateMany).toHaveBeenCalledWith({
        where: { id: "pedido-1", estado: "contacto_habilitado", desenlacePostergado: false },
        data: {
          // 7 dias (postergacion_desenlace_dias) desde el cierreAutomaticoEn
          // ACTUAL (2026-01-15), no desde "ahora": tiene que dar 2026-01-22.
          cierreAutomaticoEn: new Date("2026-01-22T00:00:00.000Z"),
          desenlacePostergado: true,
        },
      });
    });

    it("rechaza con conflicto si desenlacePostergado ya es true (solo se puede postergar una vez)", async () => {
      const { service } = crearService({
        pedidoExistente: crearPedidoBase({ desenlacePostergado: true }),
        updateManyPostergarCount: 0,
      });

      const error = await capturarError(
        service.cerrar(
          "cliente-1",
          "pedido-1",
          datosCerrar({ desenlace: "todavia_no_lo_resolvi" }),
        ),
      );

      expect(error).toBeInstanceOf(ConflictException);
    });

    it("no transiciona el estado del pedido (no pasa por transicionar())", async () => {
      const { service, tx } = crearService();

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({ desenlace: "todavia_no_lo_resolvi" }),
      );

      // El camino de postergar usa prisma.pedido.updateMany directo (fuera de
      // $transaction), nunca tx.pedido.updateMany (que es el que usa
      // transicionar() para cambiar el estado).
      expect(tx.pedido.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('desenlace "lo_hizo_este_profesional"', () => {
    it("rechaza con 400 si no viene contactoId (defensa en profundidad, el schema ya lo exige)", async () => {
      const { service, tx } = crearService();

      const error = await capturarError(
        service.cerrar(
          "cliente-1",
          "pedido-1",
          // Se hace un cast: el schema de zod ya exige contactoId, esto
          // simula un caller que se salteo la validacion del DTO.
          { desenlace: "lo_hizo_este_profesional" } as CerrarPedido,
        ),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(tx.perfilProfesional.update).not.toHaveBeenCalled();
    });

    it("rechaza con 400 si el contactoId no pertenece a este pedido", async () => {
      const { service, tx } = crearService({
        contacto: crearContactoMock({ pedidoId: "otro-pedido" }),
      });

      const error = await capturarError(
        service.cerrar(
          "cliente-1",
          "pedido-1",
          datosCerrar({ desenlace: "lo_hizo_este_profesional", contactoId: "contacto-1" }),
        ),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(tx.perfilProfesional.update).not.toHaveBeenCalled();
    });

    it("cierra el pedido (transiciona a cerrado) e incrementa trabajosCerrados del profesional del contacto", async () => {
      const { service, tx } = crearService();

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({ desenlace: "lo_hizo_este_profesional", contactoId: "contacto-1" }),
      );

      expect(tx.pedido.updateMany).toHaveBeenCalledWith({
        where: { id: "pedido-1", estado: "contacto_habilitado" },
        data: { desenlace: "lo_hizo_este_profesional", estado: "cerrado" },
      });
      expect(tx.perfilProfesional.update).toHaveBeenCalledWith({
        where: { id: "perfil-1" },
        data: { trabajosCerrados: { increment: 1 } },
      });
    });

    it("sin resenia: cierra e incrementa trabajosCerrados, pero no crea fila resenia ni toca los agregados", async () => {
      const { service, tx } = crearService();

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({ desenlace: "lo_hizo_este_profesional", contactoId: "contacto-1" }),
      );

      expect(tx.perfilProfesional.update).toHaveBeenCalledTimes(1);
      expect(tx.perfilProfesional.update).toHaveBeenCalledWith({
        where: { id: "perfil-1" },
        data: { trabajosCerrados: { increment: 1 } },
      });
      expect(tx.resenia.create).not.toHaveBeenCalled();
      expect(tx.resenia.aggregate).not.toHaveBeenCalled();
    });

    it("con resenia: crea la fila resenia con los datos declarados", async () => {
      const { service, tx } = crearService();

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({
          desenlace: "lo_hizo_este_profesional",
          contactoId: "contacto-1",
          resenia: {
            puntaje: 5,
            atributos: ["puntual", "prolijo"],
            comentario: "Excelente trabajo",
            montoDeclarado: 15000,
          },
        }),
      );

      expect(tx.resenia.create).toHaveBeenCalledWith({
        data: {
          pedidoId: "pedido-1",
          contactoId: "contacto-1",
          profesionalId: "perfil-1",
          clienteId: "cliente-1",
          puntaje: 5,
          atributos: ["puntual", "prolijo"],
          comentario: "Excelente trabajo",
          montoDeclarado: 15000,
        },
      });
    });

    it("con resenia: recalcula promedioResenias/cantidadResenias del perfil con aggregate() (perfil con resenias previas)", async () => {
      const { service, tx } = crearService();
      tx.resenia.aggregate.mockResolvedValue({ _avg: { puntaje: 4.2 }, _count: { _all: 6 } });

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({
          desenlace: "lo_hizo_este_profesional",
          contactoId: "contacto-1",
          resenia: { puntaje: 3, atributos: [] },
        }),
      );

      expect(tx.resenia.aggregate).toHaveBeenCalledWith({
        where: { profesionalId: "perfil-1" },
        _avg: { puntaje: true },
        _count: { _all: true },
      });
      // El segundo update del perfil (el primero fue trabajosCerrados) escribe
      // el resultado del aggregate tal cual, sin recalcular la formula a mano.
      expect(tx.perfilProfesional.update).toHaveBeenNthCalledWith(2, {
        where: { id: "perfil-1" },
        data: { promedioResenias: 4.2, cantidadResenias: 6 },
      });
    });

    it("registra el evento resenia_publicada solo cuando se creo una resenia", async () => {
      const { service, eventos } = crearService();

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({
          desenlace: "lo_hizo_este_profesional",
          contactoId: "contacto-1",
          resenia: { puntaje: 5, atributos: [] },
        }),
      );

      expect(eventos.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: "resenia_publicada", pedidoId: "pedido-1" }),
      );
    });

    it("no registra resenia_publicada cuando no se manda resenia", async () => {
      const { service, eventos } = crearService();

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({ desenlace: "lo_hizo_este_profesional", contactoId: "contacto-1" }),
      );

      expect(eventos.registrar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: "resenia_publicada" }),
      );
    });

    it("traduce el P2002 del @@unique(contactoId) de Resenia a un conflicto legible, no a un error interno", async () => {
      const { service } = crearService({
        resenieCreateError: new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        }),
      });

      const error = await capturarError(
        service.cerrar(
          "cliente-1",
          "pedido-1",
          datosCerrar({
            desenlace: "lo_hizo_este_profesional",
            contactoId: "contacto-1",
            resenia: { puntaje: 5, atributos: [] },
          }),
        ),
      );

      expect(error).toBeInstanceOf(ConflictException);
    });
  });

  describe('desenlaces "lo_hizo_otro" y "ya_no_lo_necesito"', () => {
    it.each(["lo_hizo_otro", "ya_no_lo_necesito"] as const)(
      '"%s": cierra el pedido sin tocar trabajosCerrados ni crear resenia',
      async (desenlace) => {
        const { service, tx } = crearService();

        await service.cerrar("cliente-1", "pedido-1", datosCerrar({ desenlace }));

        expect(tx.pedido.updateMany).toHaveBeenCalledWith({
          where: { id: "pedido-1", estado: "contacto_habilitado" },
          data: { desenlace, estado: "cerrado" },
        });
        expect(tx.perfilProfesional.update).not.toHaveBeenCalled();
        expect(tx.resenia.create).not.toHaveBeenCalled();
      },
    );
  });

  describe("postulaciones abiertas (docs/dominio.md §4, tabla D2)", () => {
    it.each(["lo_hizo_este_profesional", "lo_hizo_otro", "ya_no_lo_necesito"] as const)(
      'con desenlace "%s": caduca las postulaciones que seguian enviada/vista, dentro de la misma transaccion',
      async (desenlace) => {
        const { service, tx } = crearService({
          postulacionesAbiertas: [
            { id: "postulacion-2", estado: "enviada" },
            { id: "postulacion-3", estado: "vista" },
          ],
        });

        await service.cerrar(
          "cliente-1",
          "pedido-1",
          datosCerrar({ desenlace, contactoId: "contacto-1" }),
        );

        expect(tx.postulacion.findMany).toHaveBeenCalledWith({
          where: { pedidoId: "pedido-1", estado: { in: ["enviada", "vista"] } },
          select: { id: true, estado: true },
        });
        // caducarPostulacionesAbiertas llama a transicionar() por cada una,
        // que hace su propio updateMany condicional al estado de origen.
        expect(tx.postulacion.updateMany).toHaveBeenCalledTimes(2);
        expect(tx.postulacion.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ id: "postulacion-2", estado: "enviada" }),
            data: expect.objectContaining({ estado: "caducada" }),
          }),
        );
        expect(tx.postulacion.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ id: "postulacion-3", estado: "vista" }),
            data: expect.objectContaining({ estado: "caducada" }),
          }),
        );
      },
    );

    it('no caduca ninguna postulacion en el camino "todavia_no_lo_resolvi" (el pedido no cierra)', async () => {
      const { service, tx } = crearService();

      await service.cerrar(
        "cliente-1",
        "pedido-1",
        datosCerrar({ desenlace: "todavia_no_lo_resolvi" }),
      );

      expect(tx.postulacion.findMany).not.toHaveBeenCalled();
    });
  });
});
