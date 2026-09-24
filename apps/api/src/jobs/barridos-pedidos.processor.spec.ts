import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Job } from "bullmq";
import type { NotificacionesService } from "../modules/notificaciones/notificaciones.service.js";
import type { EventosService } from "../modules/eventos/eventos.service.js";
import type { ParametrosService } from "../modules/parametros/parametros.service.js";
import type { PrismaService } from "../infra/prisma/prisma.service.js";
import { BarridosPedidosProcessor } from "./barridos-pedidos.processor.js";

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

function crearParametrosMock(overrides: Partial<Record<string, number>> = {}): ParametrosService {
  const valores: Record<string, number> = {
    pedido_vigencia_dias: 7,
    aviso_expiracion_dia: 6,
    aviso_sin_postulaciones_horas: 12,
    consulta_contacto_horas: 48,
    // docs/dominio.md §5, valores sembrados en parametro_negocio.
    cierre_automatico_dias: 14,
    postergacion_desenlace_dias: 7,
    consulta_desenlace_dias: 7,
    ...overrides,
  };
  return {
    getNumero: jest.fn((clave: string) => Promise.resolve(valores[clave])),
    getTexto: jest.fn(),
  } as unknown as ParametrosService;
}

function crearNotificacionesMock(): NotificacionesService {
  return {
    crear: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
    crearVarias: jest.fn<(datos: unknown[]) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as NotificacionesService;
}

function crearEventosMock(): EventosService {
  return {
    registrar: jest.fn<(datos: unknown) => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as EventosService;
}

function crearJob(nombre: string): Job {
  return { name: nombre } as Job;
}

describe("BarridosPedidosProcessor", () => {
  // Reloj controlado (CLAUDE.md, "Tiempo: controla el reloj"): todos los
  // barridos calculan sus ventanas contra `new Date()`/`Date.now()`, asi que
  // fijar "ahora" es la unica forma de probar el limite exacto de cada
  // ventana sin sleep ni tiempo real.
  const ahora = new Date("2026-02-01T00:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(ahora);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("barrido de expiracion", () => {
    function crearProcessor(options: { pedidosVencidos?: Record<string, unknown>[] } = {}) {
      const tx = {
        pedido: {
          updateMany: jest
            .fn<(args: unknown) => Promise<{ count: number }>>()
            .mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
        },
        postulacion: {
          findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
          updateMany: jest
            .fn<(args: unknown) => Promise<{ count: number }>>()
            .mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
        },
      };
      const prisma = {
        pedido: {
          findMany: jest
            .fn<(args: unknown) => Promise<Record<string, unknown>[]>>()
            .mockResolvedValue(options.pedidosVencidos ?? []),
        },
        $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
      };
      prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

      const parametros = crearParametrosMock();
      const notificaciones = crearNotificacionesMock();
      const eventos = crearEventosMock();
      const processor = new BarridosPedidosProcessor(
        prisma as unknown as PrismaService,
        parametros,
        notificaciones,
        eventos,
      );
      return { processor, prisma, tx };
    }

    it("consulta solo pedidos publicado/con_postulaciones con expiraEn vencido (<=ahora): un pedido cerrado o con expiraEn futuro nunca puede aparecer en el lote", async () => {
      const { processor, prisma } = crearProcessor();

      await processor.process(crearJob("expiracion"));

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estado: { in: ["publicado", "con_postulaciones"] },
            expiraEn: { lte: ahora },
          },
        }),
      );
    });

    it("transiciona a expirado y caduca sus postulaciones enviada/vista, pero no toca las que ya estan en otro estado", async () => {
      const { processor, tx } = crearProcessor({
        pedidosVencidos: [{ id: "pedido-1", estado: "publicado" }],
      });
      tx.postulacion.findMany.mockResolvedValue([
        { id: "postulacion-1", estado: "enviada" },
        { id: "postulacion-2", estado: "vista" },
      ]);

      await processor.process(crearJob("expiracion"));

      expect(tx.pedido.updateMany).toHaveBeenCalledWith({
        where: { id: "pedido-1", estado: "publicado" },
        data: { estado: "expirado" },
      });
      expect(tx.postulacion.findMany).toHaveBeenCalledWith({
        where: { pedidoId: "pedido-1", estado: { in: ["enviada", "vista"] } },
        select: { id: true, estado: true },
      });
      expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
        where: { id: "postulacion-1", estado: "enviada" },
        data: { estado: "caducada" },
      });
      expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
        where: { id: "postulacion-2", estado: "vista" },
        data: { estado: "caducada" },
      });
    });
  });

  describe("barrido de aviso de expiracion (dia 6)", () => {
    function crearProcessor(pedidos: Record<string, unknown>[] = []) {
      const prisma = {
        pedido: {
          findMany: jest
            .fn<(args: unknown) => Promise<Record<string, unknown>[]>>()
            .mockResolvedValue(pedidos),
        },
      };
      const parametros = crearParametrosMock();
      const notificaciones = crearNotificacionesMock();
      const eventos = crearEventosMock();
      const processor = new BarridosPedidosProcessor(
        prisma as unknown as PrismaService,
        parametros,
        notificaciones,
        eventos,
      );
      return { processor, prisma, notificaciones };
    }

    it("la ventana es exactamente (vigenciaDias - avisoDia) desde ahora: con 7 y 6 dias, dispara entre ahora y +1 dia", async () => {
      const { processor, prisma } = crearProcessor();

      await processor.process(crearJob("aviso-expiracion"));

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estado: { in: ["publicado", "con_postulaciones"] },
            expiraEn: { gt: ahora, lte: new Date(ahora.getTime() + 1 * DIA_MS) },
          },
        }),
      );
    });

    it("notifica pedido_por_expirar a cada cliente de la ventana, con objetoId = pedido", async () => {
      const { processor, notificaciones } = crearProcessor([
        { id: "pedido-1", clienteId: "cliente-1" },
      ]);

      await processor.process(crearJob("aviso-expiracion"));

      expect(notificaciones.crearVarias).toHaveBeenCalledWith([
        { usuarioId: "cliente-1", tipo: "pedido_por_expirar", objetoId: "pedido-1" },
      ]);
    });
  });

  describe("barrido de aviso sin postulaciones (12h)", () => {
    function crearProcessor(pedidos: Record<string, unknown>[] = []) {
      const prisma = {
        pedido: {
          findMany: jest
            .fn<(args: unknown) => Promise<Record<string, unknown>[]>>()
            .mockResolvedValue(pedidos),
        },
      };
      const parametros = crearParametrosMock();
      const notificaciones = crearNotificacionesMock();
      const eventos = crearEventosMock();
      const processor = new BarridosPedidosProcessor(
        prisma as unknown as PrismaService,
        parametros,
        notificaciones,
        eventos,
      );
      return { processor, prisma, notificaciones };
    }

    it("solo consulta pedidos en 'publicado' (nunca con_postulaciones): eso es lo que garantiza cantidadPostulaciones === 0", async () => {
      const { processor, prisma } = crearProcessor();

      await processor.process(crearJob("aviso-sin-postulaciones"));

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estado: "publicado",
            publicadoEn: { lte: new Date(ahora.getTime() - 12 * HORA_MS) },
          },
        }),
      );
    });

    it("notifica pedido_sin_postulaciones a los pedidos publicados hace >= 12h", async () => {
      const { processor, notificaciones } = crearProcessor([
        { id: "pedido-1", clienteId: "cliente-1" },
      ]);

      await processor.process(crearJob("aviso-sin-postulaciones"));

      expect(notificaciones.crearVarias).toHaveBeenCalledWith([
        { usuarioId: "cliente-1", tipo: "pedido_sin_postulaciones", objetoId: "pedido-1" },
      ]);
    });
  });

  describe("barrido de consulta de contacto (48h)", () => {
    function crearProcessor(contactos: Record<string, unknown>[] = []) {
      const prisma = {
        contacto: {
          findMany: jest
            .fn<(args: unknown) => Promise<Record<string, unknown>[]>>()
            .mockResolvedValue(contactos),
        },
      };
      const parametros = crearParametrosMock();
      const notificaciones = crearNotificacionesMock();
      const eventos = crearEventosMock();
      const processor = new BarridosPedidosProcessor(
        prisma as unknown as PrismaService,
        parametros,
        notificaciones,
        eventos,
      );
      return { processor, prisma, notificaciones };
    }

    it("consulta por habilitadoEn del Contacto (no publicadoEn del pedido) con la ventana de 48h", async () => {
      const { processor, prisma } = crearProcessor();

      await processor.process(crearJob("consulta-contacto"));

      expect(prisma.contacto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            habilitadoEn: { lte: new Date(ahora.getTime() - 48 * HORA_MS) },
            pedido: { estado: "contacto_habilitado" },
          },
        }),
      );
    });

    it("dos contactos del mismo pedido generan dos notificaciones separadas, con objetoId = id del contacto (no del pedido)", async () => {
      const { processor, notificaciones } = crearProcessor([
        { id: "contacto-1", pedido: { clienteId: "cliente-1" } },
        { id: "contacto-2", pedido: { clienteId: "cliente-1" } },
      ]);

      await processor.process(crearJob("consulta-contacto"));

      expect(notificaciones.crearVarias).toHaveBeenCalledWith([
        { usuarioId: "cliente-1", tipo: "consulta_contacto", objetoId: "contacto-1" },
        { usuarioId: "cliente-1", tipo: "consulta_contacto", objetoId: "contacto-2" },
      ]);
    });
  });

  describe("barrido de consulta de desenlace", () => {
    function crearProcessor(
      pedidos: Record<string, unknown>[] = [],
      parametrosOverrides: Partial<Record<string, number>> = {},
    ) {
      const prisma = {
        pedido: {
          findMany: jest
            .fn<(args: unknown) => Promise<Record<string, unknown>[]>>()
            .mockResolvedValue(pedidos),
        },
      };
      const parametros = crearParametrosMock(parametrosOverrides);
      const notificaciones = crearNotificacionesMock();
      const eventos = crearEventosMock();
      const processor = new BarridosPedidosProcessor(
        prisma as unknown as PrismaService,
        parametros,
        notificaciones,
        eventos,
      );
      return { processor, prisma, notificaciones };
    }

    it("con los valores sembrados (cierre 14, consulta 7), la ventana normal es (cierre-consulta)=7 dias y la postergada (postergacion-consulta)=0 dias, ambas relativas a cierreAutomaticoEn", async () => {
      const { processor, prisma } = crearProcessor();

      await processor.process(crearJob("consulta-desenlace"));

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            estado: "contacto_habilitado",
            OR: [
              {
                desenlacePostergado: false,
                cierreAutomaticoEn: { gt: ahora, lte: new Date(ahora.getTime() + 7 * DIA_MS) },
              },
              {
                desenlacePostergado: true,
                cierreAutomaticoEn: { gt: ahora, lte: new Date(ahora.getTime() + 0 * DIA_MS) },
              },
            ],
          },
        }),
      );
    });

    // Consigna de la tarea: el bug original trataba consulta_desenlace_dias
    // como "dias que faltan para el cierre" en vez de "dias desde el inicio
    // de la fase actual" (docs/dominio.md §5: "Desde el primer contacto").
    // Con los valores sembrados ambas lecturas coinciden (14-7=7=7), asi que
    // hace falta un parametro distinto del sembrado para que la diferencia
    // se note: con consulta_desenlace_dias=5 (cierre_automatico_dias=14
    // sigue igual), la ventana normal correcta es (14-5)=9 dias, no 5.
    it("si consulta_desenlace_dias cambia sin tocar los otros dos parametros, la ventana normal se recalcula relativa a cierre_automatico_dias (no un offset fijo)", async () => {
      const { processor, prisma } = crearProcessor([], { consulta_desenlace_dias: 5 });

      await processor.process(crearJob("consulta-desenlace"));

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              expect.objectContaining({
                desenlacePostergado: false,
                // (cierre_automatico_dias=14) - (consulta_desenlace_dias=5) = 9,
                // nunca 5 (el bug original habria puesto directamente 5 aca).
                cierreAutomaticoEn: { gt: ahora, lte: new Date(ahora.getTime() + 9 * DIA_MS) },
              }),
              expect.objectContaining({ desenlacePostergado: true }),
            ],
          }),
        }),
      );
    });

    // El detalle mas importante de este barrido (consigna de la tarea): si se
    // usara el mismo tipo de notificacion las dos veces, el dedupe de
    // Notificacion (usuarioId+tipo+objetoId, mismo pedidoId como objetoId)
    // bloquearia silenciosamente la segunda pregunta tras la postergacion.
    it("usa el tipo consulta_desenlace cuando desenlacePostergado es false", async () => {
      const { processor, notificaciones } = crearProcessor([
        { id: "pedido-1", clienteId: "cliente-1", desenlacePostergado: false },
      ]);

      await processor.process(crearJob("consulta-desenlace"));

      expect(notificaciones.crearVarias).toHaveBeenCalledWith([
        { usuarioId: "cliente-1", tipo: "consulta_desenlace", objetoId: "pedido-1" },
      ]);
    });

    it("usa el tipo consulta_desenlace_postergada (distinto) cuando desenlacePostergado es true", async () => {
      const { processor, notificaciones } = crearProcessor([
        { id: "pedido-1", clienteId: "cliente-1", desenlacePostergado: true },
      ]);

      await processor.process(crearJob("consulta-desenlace"));

      expect(notificaciones.crearVarias).toHaveBeenCalledWith([
        { usuarioId: "cliente-1", tipo: "consulta_desenlace_postergada", objetoId: "pedido-1" },
      ]);
    });
  });

  describe("barrido de cierre automatico", () => {
    function crearProcessor(pedidos: Record<string, unknown>[] = []) {
      const tx = {
        pedido: {
          updateMany: jest
            .fn<(args: unknown) => Promise<{ count: number }>>()
            .mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
        },
        postulacion: {
          findMany: jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]),
          updateMany: jest
            .fn<(args: unknown) => Promise<{ count: number }>>()
            .mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
        },
        resenia: {
          create: jest.fn<(args: unknown) => Promise<unknown>>(),
        },
      };
      const prisma = {
        pedido: {
          findMany: jest
            .fn<(args: unknown) => Promise<Record<string, unknown>[]>>()
            .mockResolvedValue(pedidos),
        },
        $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
      };
      prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

      const parametros = crearParametrosMock();
      const notificaciones = crearNotificacionesMock();
      const eventos = crearEventosMock();
      const processor = new BarridosPedidosProcessor(
        prisma as unknown as PrismaService,
        parametros,
        notificaciones,
        eventos,
      );
      return { processor, prisma, tx, eventos };
    }

    it("consulta pedidos contacto_habilitado con cierreAutomaticoEn vencido (<=ahora)", async () => {
      const { processor, prisma } = crearProcessor();

      await processor.process(crearJob("cierre-automatico"));

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { estado: "contacto_habilitado", cierreAutomaticoEn: { lte: ahora } },
        }),
      );
    });

    it("transiciona a cerrado sin setear desenlace (nadie lo declaro), caduca postulaciones abiertas y no crea ninguna fila en resenia", async () => {
      const pedido = {
        id: "pedido-1",
        clienteId: "cliente-1",
        categoria: { slug: "plomeria" },
        barrio: { nombre: "Palermo" },
      };
      const { processor, tx } = crearProcessor([pedido]);
      tx.postulacion.findMany.mockResolvedValue([{ id: "postulacion-2", estado: "enviada" }]);

      await processor.process(crearJob("cierre-automatico"));

      // Ningun tercer argumento (datosAdicionales) con `desenlace`: el data
      // del updateMany es solo `{ estado: "cerrado" }`.
      expect(tx.pedido.updateMany).toHaveBeenCalledWith({
        where: { id: "pedido-1", estado: "contacto_habilitado" },
        data: { estado: "cerrado" },
      });
      expect(tx.postulacion.findMany).toHaveBeenCalledWith({
        where: { pedidoId: "pedido-1", estado: { in: ["enviada", "vista"] } },
        select: { id: true, estado: true },
      });
      expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
        where: { id: "postulacion-2", estado: "enviada" },
        data: { estado: "caducada" },
      });
      expect(tx.resenia.create).not.toHaveBeenCalled();
    });

    it("registra el evento pedido_cerrado con categoria/zona/rol del pedido cerrado", async () => {
      const pedido = {
        id: "pedido-1",
        clienteId: "cliente-1",
        categoria: { slug: "plomeria" },
        barrio: { nombre: "Palermo" },
      };
      const { processor, eventos } = crearProcessor([pedido]);

      await processor.process(crearJob("cierre-automatico"));

      expect(eventos.registrar).toHaveBeenCalledWith({
        tipo: "pedido_cerrado",
        categoria: "plomeria",
        zona: "Palermo",
        rol: "cliente",
        usuarioId: "cliente-1",
        pedidoId: "pedido-1",
      });
    });
  });
});
