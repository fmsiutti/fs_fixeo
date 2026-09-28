import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException, HttpException } from "@nestjs/common";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  SuscripcionInvalidaError,
  type ProveedorWebPush,
} from "../../infra/webpush/proveedor-web-push.js";
import { NotificacionesService } from "./notificaciones.service.js";

async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa rechazara, pero se resolvio.");
}

// Fix 2 (b): `crear()`/`crearVarias()` disparan el push con `void` (fire-and-
// forget), asi que el envio real corre en microtasks posteriores a que la
// promesa principal ya se resolvio. Los tests que verifican el push esperan
// una vuelta de macrotask para dejar que esas microtasks terminen antes de
// aserter.
async function esperarTareasPendientes(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

interface NotificacionFila {
  id: string;
  tipo: string;
  objetoId: string | null;
  leidaEn: Date | null;
  creadaEn: Date;
}

function crearPrismaMock(
  overrides: {
    notificacionExistente?: { id: string } | null;
    suscripciones?: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
    // Fix 1: la dedup de crearVarias ahora chequea la tupla completa
    // (usuarioId, tipo, objetoId), no solo usuarioId.
    notificacionesExistentes?: Array<{ usuarioId: string; tipo: string; objetoId: string | null }>;
    // notificacion.findMany en produccion sirve dos propositos distintos
    // (dedup de crearVarias y paginado de listar): el mock los separa via
    // overrides propios en vez de un findMany generico, para que cada test
    // sea explicito sobre cual de los dos esta ejercitando.
    paginaNotificaciones?: NotificacionFila[];
    notificacionUnica?: { usuarioId: string } | null;
    // Fix 3: fila existente de suscripcionPush por endpoint (null = endpoint nuevo).
    suscripcionExistente?: { id: string; endpoint: string; p256dh: string; auth: string } | null;
  } = {},
) {
  return {
    notificacion: {
      findFirst: jest
        .fn<(args: unknown) => Promise<{ id: string } | null>>()
        .mockResolvedValue(overrides.notificacionExistente ?? null),
      create: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ id: "notif-1" }),
      createMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
      findMany: jest
        .fn<(args: unknown) => Promise<unknown[]>>()
        .mockResolvedValue(
          overrides.paginaNotificaciones ?? overrides.notificacionesExistentes ?? [],
        ),
      findUnique: jest
        .fn<(args: unknown) => Promise<{ usuarioId: string } | null>>()
        .mockResolvedValue(overrides.notificacionUnica ?? null),
      update: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
    },
    suscripcionPush: {
      findMany: jest
        .fn<
          (
            args: unknown,
          ) => Promise<Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>
        >()
        .mockResolvedValue(overrides.suscripciones ?? []),
      findUnique: jest
        .fn<
          (
            args: unknown,
          ) => Promise<{ id: string; endpoint: string; p256dh: string; auth: string } | null>
        >()
        .mockResolvedValue(overrides.suscripcionExistente ?? null),
      delete: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
      upsert: jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({}),
      deleteMany: jest
        .fn<(args: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 0 }),
    },
  };
}

function filaDeEjemplo(overrides: Partial<NotificacionFila> = {}): NotificacionFila {
  return {
    id: "notif-1",
    tipo: "primera_postulacion",
    objetoId: "pedido-1",
    leidaEn: null,
    creadaEn: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("NotificacionesService", () => {
  describe("crear", () => {
    it("no reenvia push si la notificacion ya existia (dedup)", async () => {
      const prisma = crearPrismaMock({ notificacionExistente: { id: "notif-existente" } });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.crear({
        usuarioId: "usuario-1",
        tipo: "primera_postulacion",
        objetoId: "pedido-1",
      });

      expect(prisma.notificacion.create).not.toHaveBeenCalled();
      expect(webPush.enviar).not.toHaveBeenCalled();
    });

    it("envia push a cada suscripcion del usuario cuando la notificacion es nueva", async () => {
      const prisma = crearPrismaMock({
        suscripciones: [
          { id: "sus-1", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
        ],
      });
      const webPush: ProveedorWebPush = {
        enviar: jest.fn<ProveedorWebPush["enviar"]>().mockResolvedValue(),
      };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.crear({
        usuarioId: "usuario-1",
        tipo: "primera_postulacion",
        objetoId: "pedido-1",
      });
      await esperarTareasPendientes();

      expect(webPush.enviar).toHaveBeenCalledWith(
        { endpoint: "https://push.example/1", keys: { p256dh: "p", auth: "a" } },
        expect.objectContaining({ ruta: "/pedidos/pedido-1" }),
      );
    });

    it("borra la suscripcion cuando el proveedor la reporta invalida, sin romper la accion", async () => {
      const prisma = crearPrismaMock({
        suscripciones: [
          { id: "sus-1", endpoint: "https://push.example/1", p256dh: "p", auth: "a" },
        ],
      });
      const webPush: ProveedorWebPush = {
        enviar: jest
          .fn<ProveedorWebPush["enviar"]>()
          .mockRejectedValue(new SuscripcionInvalidaError("https://push.example/1")),
      };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await expect(
        service.crear({
          usuarioId: "usuario-1",
          tipo: "primera_postulacion",
          objetoId: "pedido-1",
        }),
      ).resolves.toBeUndefined();
      await esperarTareasPendientes();

      expect(prisma.suscripcionPush.delete).toHaveBeenCalledWith({ where: { id: "sus-1" } });
    });
  });

  describe("crearVarias", () => {
    it("filtra los usuarios que ya tenian la misma (tipo, objetoId) y solo crea/empuja para el resto", async () => {
      const prisma = crearPrismaMock({
        notificacionesExistentes: [
          { usuarioId: "usuario-1", tipo: "pedido_nuevo_coincide", objetoId: "pedido-1" },
        ],
        suscripciones: [],
      });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.crearVarias([
        { usuarioId: "usuario-1", tipo: "pedido_nuevo_coincide", objetoId: "pedido-1" },
        { usuarioId: "usuario-2", tipo: "pedido_nuevo_coincide", objetoId: "pedido-1" },
      ]);

      expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
        data: [{ usuarioId: "usuario-2", tipo: "pedido_nuevo_coincide", objetoId: "pedido-1" }],
        skipDuplicates: true,
      });
    });

    // Fix 1, revision de codigo del slice 10: antes del fix, el filtro de
    // dedup usaba solo `datos[0].tipo`/`datos[0].objetoId`, asumiendo que
    // todo el lote comparte esos valores. Los barridos de jobs (p. ej.
    // barridos-pedidos.processor.ts) mandan un `objetoId` distinto por
    // usuario en el mismo lote: este test lo reproduce con dos usuarios,
    // cada uno con su propio pedido, uno de los dos ya notificado.
    it("con un lote heterogeneo (objetoId distinto por usuario), solo filtra al usuario que ya tenia SU propia notificacion", async () => {
      const prisma = crearPrismaMock({
        notificacionesExistentes: [
          { usuarioId: "usuario-1", tipo: "pedido_sin_postulaciones", objetoId: "pedido-1" },
        ],
        suscripciones: [
          { id: "sus-2", endpoint: "https://push.example/2", p256dh: "p2", auth: "a2" },
        ],
      });
      const webPush: ProveedorWebPush = {
        enviar: jest.fn<ProveedorWebPush["enviar"]>().mockResolvedValue(),
      };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.crearVarias([
        { usuarioId: "usuario-1", tipo: "pedido_sin_postulaciones", objetoId: "pedido-1" },
        { usuarioId: "usuario-2", tipo: "pedido_sin_postulaciones", objetoId: "pedido-2" },
      ]);
      await esperarTareasPendientes();

      // El ya notificado (usuario-1, pedido-1) no se reinserta ni se le
      // reenvia el push.
      expect(prisma.notificacion.createMany).toHaveBeenCalledWith({
        data: [{ usuarioId: "usuario-2", tipo: "pedido_sin_postulaciones", objetoId: "pedido-2" }],
        skipDuplicates: true,
      });
      expect(webPush.enviar).toHaveBeenCalledTimes(1);
      expect(webPush.enviar).toHaveBeenCalledWith(
        { endpoint: "https://push.example/2", keys: { p256dh: "p2", auth: "a2" } },
        expect.anything(),
      );
    });

    it("no hace nada si la lista esta vacia", async () => {
      const prisma = crearPrismaMock();
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.crearVarias([]);

      expect(prisma.notificacion.findMany).not.toHaveBeenCalled();
      expect(prisma.notificacion.createMany).not.toHaveBeenCalled();
    });
  });

  describe("listar", () => {
    it("pagina por cursor: pide una fila de mas, corta en el tamanio de pagina y devuelve el id de la ultima como cursor", async () => {
      // TAMANIO_PAGINA (privado en el service) es 20: el service pide 21 para
      // saber si hay una pagina siguiente sin una segunda consulta.
      const filas = Array.from({ length: 21 }, (_, i) =>
        filaDeEjemplo({ id: `notif-${i}`, creadaEn: new Date(2026, 0, 21 - i) }),
      );
      const prisma = crearPrismaMock({ paginaNotificaciones: filas });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      const resultado = await service.listar("usuario-1");

      expect(resultado.items).toHaveLength(20);
      expect(resultado.items.map((item) => item.id)).toEqual(filas.slice(0, 20).map((f) => f.id));
      expect(resultado.cursor).toBe("notif-19");
      expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: "usuario-1" }, take: 21 }),
      );
    });

    it("sin fila extra no hay cursor de pagina siguiente", async () => {
      const filas = [filaDeEjemplo({ id: "notif-1" }), filaDeEjemplo({ id: "notif-2" })];
      const prisma = crearPrismaMock({ paginaNotificaciones: filas });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      const resultado = await service.listar("usuario-1");

      expect(resultado.items).toHaveLength(2);
      expect(resultado.cursor).toBeNull();
    });

    it("con cursorId, lo reenvia a prisma como cursor de paginado con skip:1", async () => {
      const prisma = crearPrismaMock({ paginaNotificaciones: [] });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.listar("usuario-1", "notif-19");

      expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: "notif-19" }, skip: 1 }),
      );
    });
  });

  describe("marcarLeida", () => {
    it("da 404 uniforme si la notificacion no existe", async () => {
      const prisma = crearPrismaMock({ notificacionUnica: null });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      const error = await capturarError(service.marcarLeida("usuario-1", "notif-1"));

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(404);
      expect((error as HttpException).getResponse()).toMatchObject({ codigo: "no_encontrado" });
      expect(prisma.notificacion.update).not.toHaveBeenCalled();
    });

    it("da el mismo 404 si la notificacion existe pero es de otro usuario (no revela que existe)", async () => {
      const prisma = crearPrismaMock({ notificacionUnica: { usuarioId: "usuario-2" } });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      const error = await capturarError(service.marcarLeida("usuario-1", "notif-1"));

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(404);
      expect((error as HttpException).getResponse()).toMatchObject({ codigo: "no_encontrado" });
      expect(prisma.notificacion.update).not.toHaveBeenCalled();
    });

    it("marca leidaEn cuando la notificacion es del usuario", async () => {
      const prisma = crearPrismaMock({ notificacionUnica: { usuarioId: "usuario-1" } });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.marcarLeida("usuario-1", "notif-1");

      expect(prisma.notificacion.update).toHaveBeenCalledWith({
        where: { id: "notif-1" },
        data: { leidaEn: expect.any(Date) },
      });
    });
  });

  describe("suscribirPush", () => {
    it("endpoint nuevo (sin fila previa): hace upsert normal", async () => {
      const prisma = crearPrismaMock({ suscripcionExistente: null });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.suscribirPush("usuario-nuevo", {
        endpoint: "https://push.example/nuevo",
        keys: { p256dh: "p256dh-2", auth: "auth-2" },
      });

      expect(prisma.suscripcionPush.upsert).toHaveBeenCalledWith({
        where: { endpoint: "https://push.example/nuevo" },
        create: {
          usuarioId: "usuario-nuevo",
          endpoint: "https://push.example/nuevo",
          p256dh: "p256dh-2",
          auth: "auth-2",
        },
        update: { usuarioId: "usuario-nuevo", p256dh: "p256dh-2", auth: "auth-2" },
      });
    });

    // Fix 3, revision de codigo del slice 10: mismo endpoint, mismas claves,
    // otra cuenta logueada en el medio (dispositivo compartido con
    // logout/login) es un caso legitimo de reasignacion.
    it("mismo endpoint, MISMAS claves, otra cuenta: reasigna la suscripcion (dispositivo compartido)", async () => {
      const prisma = crearPrismaMock({
        suscripcionExistente: {
          id: "sus-1",
          endpoint: "https://push.example/compartido",
          p256dh: "p256dh-a",
          auth: "auth-a",
        },
      });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.suscribirPush("usuario-b", {
        endpoint: "https://push.example/compartido",
        keys: { p256dh: "p256dh-a", auth: "auth-a" },
      });

      expect(prisma.suscripcionPush.upsert).toHaveBeenCalledWith({
        where: { endpoint: "https://push.example/compartido" },
        create: {
          usuarioId: "usuario-b",
          endpoint: "https://push.example/compartido",
          p256dh: "p256dh-a",
          auth: "auth-a",
        },
        update: { usuarioId: "usuario-b", p256dh: "p256dh-a", auth: "auth-a" },
      });
    });

    // Fix 3: mismo endpoint, claves DISTINTAS, es la senial de que alguien
    // esta mandando el endpoint de otra cuenta (robo/reasignacion ajena):
    // se rechaza en vez de reasignar.
    it("mismo endpoint, claves DISTINTAS: rechaza con conflicto y no reasigna", async () => {
      const prisma = crearPrismaMock({
        suscripcionExistente: {
          id: "sus-1",
          endpoint: "https://push.example/robado",
          p256dh: "p256dh-victima",
          auth: "auth-victima",
        },
      });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      const error = await capturarError(
        service.suscribirPush("usuario-atacante", {
          endpoint: "https://push.example/robado",
          keys: { p256dh: "p256dh-inventada", auth: "auth-inventada" },
        }),
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ codigo: "conflicto" });
      expect(prisma.suscripcionPush.upsert).not.toHaveBeenCalled();
    });

    // Fix 2 (d): tope de suscripciones por usuario, solo aplica cuando el
    // endpoint es nuevo para el usuario.
    it("endpoint nuevo y el usuario ya tiene el maximo de suscripciones: borra la mas vieja antes de crear", async () => {
      const suscripcionesExistentes = Array.from({ length: 5 }, (_, i) => ({
        id: `sus-${i}`,
        endpoint: `https://push.example/${i}`,
        p256dh: "p",
        auth: "a",
      }));
      const prisma = crearPrismaMock({
        suscripcionExistente: null,
        suscripciones: suscripcionesExistentes,
      });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.suscribirPush("usuario-1", {
        endpoint: "https://push.example/nuevo",
        keys: { p256dh: "p-nueva", auth: "a-nueva" },
      });

      expect(prisma.suscripcionPush.delete).toHaveBeenCalledWith({ where: { id: "sus-0" } });
      expect(prisma.suscripcionPush.upsert).toHaveBeenCalled();
    });
  });

  describe("desuscribirPush", () => {
    it("borra solo la suscripcion propia (scope por usuarioId + endpoint)", async () => {
      const prisma = crearPrismaMock();
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await service.desuscribirPush("usuario-1", "https://push.example/1");

      expect(prisma.suscripcionPush.deleteMany).toHaveBeenCalledWith({
        where: { usuarioId: "usuario-1", endpoint: "https://push.example/1" },
      });
    });

    it("no rompe si el endpoint no existe o es de otro usuario (deleteMany en 0 filas)", async () => {
      const prisma = crearPrismaMock();
      prisma.suscripcionPush.deleteMany.mockResolvedValue({ count: 0 });
      const webPush: ProveedorWebPush = { enviar: jest.fn<ProveedorWebPush["enviar"]>() };
      const service = new NotificacionesService(prisma as unknown as PrismaService, webPush);

      await expect(
        service.desuscribirPush("usuario-1", "https://push.example/ajeno"),
      ).resolves.toBeUndefined();
    });
  });
});
