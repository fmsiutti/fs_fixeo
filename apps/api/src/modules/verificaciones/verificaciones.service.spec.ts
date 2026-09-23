import { describe, expect, it, jest } from "@jest/globals";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { ResolverVerificacion, SubirDocumentoVerificacion } from "@fixeo/shared";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { ProveedorAlmacenamiento } from "../../infra/almacenamiento/proveedor-almacenamiento.js";
import type { EventosService } from "../eventos/eventos.service.js";
import type { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import type { ParametrosService } from "../parametros/parametros.service.js";
import { VerificacionesService } from "./verificaciones.service.js";

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

function crearVerificacionExistente(
  overrides: Partial<{
    id: string;
    perfilId: string;
    tipo: "identidad" | "matricula";
    oficioId: string | null;
    estado: string;
  }> = {},
) {
  return {
    id: "verificacion-1",
    perfilId: "perfil-1",
    tipo: "identidad" as const,
    oficioId: null,
    estado: "pendiente",
    ...overrides,
  };
}

function crearService(
  options: {
    verificacionExistente?: ReturnType<typeof crearVerificacionExistente> | null;
    updateManyCount?: number;
    verificacionActualizada?: Record<string, unknown>;
  } = {},
) {
  const tx = {
    verificacion: {
      updateMany: jest.fn<(args: unknown) => Promise<{ count: number }>>(),
      findUniqueOrThrow: jest.fn<(args: unknown) => Promise<Record<string, unknown>>>(),
    },
    perfilProfesional: {
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
    oficioProfesional: {
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };
  tx.verificacion.updateMany.mockResolvedValue({ count: options.updateManyCount ?? 1 });
  tx.verificacion.findUniqueOrThrow.mockResolvedValue(
    options.verificacionActualizada ?? {
      id: "verificacion-1",
      tipo: "identidad",
      estado: "aprobada",
      motivoRechazo: null,
      enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
      revisadaEn: new Date("2026-01-02T00:00:00.000Z"),
    },
  );

  const verificacionExistente =
    options.verificacionExistente === undefined
      ? crearVerificacionExistente()
      : options.verificacionExistente;

  const prisma = {
    verificacion: {
      findUnique: jest
        .fn<(args: unknown) => Promise<typeof verificacionExistente>>()
        .mockResolvedValue(verificacionExistente),
    },
    perfilProfesional: {
      findUniqueOrThrow: jest
        .fn<(args: unknown) => Promise<{ id: string; usuarioId: string }>>()
        .mockResolvedValue({ id: "perfil-1", usuarioId: "usuario-1" }),
    },
    // Solo usado por categoriaSlugDeVerificacion (evento verificacion_resuelta)
    // cuando la verificacion es de tipo matricula; en identidad nunca se llama.
    oficioProfesional: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ categoriaId: string } | null>>()
        .mockResolvedValue({ categoriaId: "categoria-1" }),
    },
    categoria: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ slug: string } | null>>()
        .mockResolvedValue({ slug: "gas" }),
    },
    $transaction: jest.fn<(callback: CallbackTransaccion) => Promise<unknown>>(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(tx));

  const almacenamiento = {} as ProveedorAlmacenamiento;
  const eventos = {
    registrar: jest.fn<(datos: unknown) => Promise<void>>(),
  } as unknown as EventosService;
  const notificaciones = {
    crear: jest.fn<(datos: unknown) => Promise<void>>(),
  } as unknown as NotificacionesService;
  const parametros = {} as ParametrosService;

  const service = new VerificacionesService(
    prisma as unknown as PrismaService,
    almacenamiento,
    eventos,
    notificaciones,
    parametros,
  );

  return { service, prisma, tx, eventos, notificaciones };
}

describe("VerificacionesService.resolver", () => {
  it("404 si la verificacion no existe", async () => {
    const { service } = crearService({ verificacionExistente: null });

    await expect(
      service.resolver("moderador-1", "verificacion-1", {
        accion: "aprobar",
      } as ResolverVerificacion),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("conflicto si la verificacion ya no esta pendiente (guarda de concurrencia)", async () => {
    const { service, tx } = crearService({ updateManyCount: 0 });

    await expect(
      service.resolver("moderador-1", "verificacion-1", {
        accion: "aprobar",
      } as ResolverVerificacion),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.perfilProfesional.update).not.toHaveBeenCalled();
  });

  it("aprobar una verificacion de identidad aprueba y marca verificadoEn en el perfil", async () => {
    const { service, tx, notificaciones } = crearService({
      verificacionExistente: crearVerificacionExistente({ tipo: "identidad" }),
    });

    await service.resolver("moderador-1", "verificacion-1", {
      accion: "aprobar",
    } as ResolverVerificacion);

    expect(tx.perfilProfesional.update).toHaveBeenCalledWith({
      where: { id: "perfil-1" },
      data: { estadoVerificacion: "aprobada", verificadoEn: expect.any(Date) },
    });
    expect(tx.oficioProfesional.update).not.toHaveBeenCalled();
    // docs/dominio.md §9: toda notificacion se persiste, aca es la de "verificacion resuelta".
    expect(notificaciones.crear).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: "usuario-1", tipo: "verificacion_resuelta" }),
    );
  });

  it("aprobar una verificacion de matricula valida el oficio, no el perfil", async () => {
    const { service, tx } = crearService({
      verificacionExistente: crearVerificacionExistente({
        tipo: "matricula",
        oficioId: "oficio-1",
      }),
    });

    await service.resolver("moderador-1", "verificacion-1", {
      accion: "aprobar",
    } as ResolverVerificacion);

    expect(tx.oficioProfesional.update).toHaveBeenCalledWith({
      where: { id: "oficio-1" },
      data: { matriculaEstado: "validada" },
    });
    expect(tx.perfilProfesional.update).not.toHaveBeenCalled();
  });

  it("rechazar combina el motivo tipificado y el detalle en un solo texto legible", async () => {
    const { service, tx } = crearService();

    await service.resolver("moderador-1", "verificacion-1", {
      accion: "rechazar",
      motivo: "foto_ilegible",
      detalle: "La foto esta borrosa",
    } as ResolverVerificacion);

    expect(tx.verificacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: "rechazada",
          motivoRechazo: "foto_ilegible: La foto esta borrosa",
        }),
      }),
    );
  });

  it("rechazar sin detalle usa solo el motivo tipificado", async () => {
    const { service, tx } = crearService();

    await service.resolver("moderador-1", "verificacion-1", {
      accion: "rechazar",
      motivo: "documento_vencido",
    } as ResolverVerificacion);

    expect(tx.verificacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ motivoRechazo: "documento_vencido" }),
      }),
    );
  });

  it("rechazar una matricula la marca rechazada en el oficio, no en el perfil", async () => {
    const { service, tx } = crearService({
      verificacionExistente: crearVerificacionExistente({
        tipo: "matricula",
        oficioId: "oficio-1",
      }),
    });

    await service.resolver("moderador-1", "verificacion-1", {
      accion: "rechazar",
      motivo: "matricula_no_valida",
    } as ResolverVerificacion);

    expect(tx.oficioProfesional.update).toHaveBeenCalledWith({
      where: { id: "oficio-1" },
      data: { matriculaEstado: "rechazada" },
    });
  });
});

type CallbackTransaccionSubida = (tx: unknown) => Promise<unknown>;

/** Mimetype "application/pdf" evita pasar por sharp (procesarArchivo lo guarda tal cual). */
function crearArchivoPdf(): Express.Multer.File {
  return {
    mimetype: "application/pdf",
    buffer: Buffer.from("pdf-de-prueba"),
  } as Express.Multer.File;
}

function crearServiceParaSubirDocumento(
  options: {
    perfil?: { id: string; usuarioId: string } | null;
    oficio?: { id: string; categoriaId: string } | null;
    verificacionExistente?: { id: string; documentos: string[] } | null;
    topeDocumentos?: number;
  } = {},
) {
  const perfil =
    options.perfil === undefined ? { id: "perfil-1", usuarioId: "usuario-1" } : options.perfil;
  const oficio =
    options.oficio === undefined ? { id: "oficio-1", categoriaId: "categoria-1" } : options.oficio;
  const verificacionExistente =
    options.verificacionExistente === undefined ? null : options.verificacionExistente;

  const verificacionResultado = {
    id: verificacionExistente?.id ?? "verificacion-nueva",
    tipo: "matricula",
    estado: "pendiente",
    motivoRechazo: null,
    enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
    revisadaEn: null,
  };

  const tx = {
    verificacion: {
      update: jest
        .fn<(args: unknown) => Promise<typeof verificacionResultado>>()
        .mockResolvedValue(verificacionResultado),
      create: jest
        .fn<(args: unknown) => Promise<typeof verificacionResultado>>()
        .mockResolvedValue(verificacionResultado),
    },
    oficioProfesional: {
      update: jest.fn<(args: unknown) => Promise<unknown>>(),
    },
  };

  const prisma = {
    perfilProfesional: {
      findUnique: jest.fn<(args: unknown) => Promise<typeof perfil>>().mockResolvedValue(perfil),
    },
    oficioProfesional: {
      findFirst: jest.fn<(args: unknown) => Promise<typeof oficio>>().mockResolvedValue(oficio),
    },
    verificacion: {
      findFirst: jest
        .fn<(args: unknown) => Promise<typeof verificacionExistente>>()
        .mockResolvedValue(verificacionExistente),
    },
    categoria: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ slug: string } | null>>()
        .mockResolvedValue({ slug: "gas" }),
    },
    $transaction: jest.fn<(callback: CallbackTransaccionSubida) => Promise<unknown>>(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccionSubida) => callback(tx));

  const almacenamiento = {
    guardar: jest
      .fn<(buffer: Buffer, key: string, contentType: string) => Promise<{ url: string }>>()
      .mockResolvedValue({ url: "url-de-prueba" }),
  } as unknown as ProveedorAlmacenamiento;
  const eventos = {
    registrar: jest.fn<(datos: unknown) => Promise<void>>(),
  } as unknown as EventosService;
  const notificaciones = {
    crear: jest.fn<(datos: unknown) => Promise<void>>(),
  } as unknown as NotificacionesService;
  const parametros = {
    getNumero: jest
      .fn<(clave: string) => Promise<number>>()
      .mockResolvedValue(options.topeDocumentos ?? 5),
  } as unknown as ParametrosService;

  const service = new VerificacionesService(
    prisma as unknown as PrismaService,
    almacenamiento,
    eventos,
    notificaciones,
    parametros,
  );

  return { service, prisma, tx, almacenamiento, parametros };
}

describe("VerificacionesService.subirDocumento", () => {
  it("rechaza sin tocar el storage si ya se alcanzo el tope de documentos de la verificacion", async () => {
    const { service, almacenamiento } = crearServiceParaSubirDocumento({
      verificacionExistente: { id: "verificacion-1", documentos: ["a", "b"] },
      topeDocumentos: 2,
    });

    await expect(
      service.subirDocumento("usuario-1", crearArchivoPdf(), {
        tipo: "identidad",
      } as SubirDocumentoVerificacion),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(almacenamiento.guardar).not.toHaveBeenCalled();
  });

  // D9 (docs/dominio.md §12): guardarOficios deja "recomendada"/"no_exigida"
  // en no_requerida de entrada, pero subir el primer documento de matricula
  // para ese oficio tiene que subirlo a pendiente igual que "obligatoria".
  it("subir un documento de matricula deja matriculaEstado en pendiente, sea cual sea la exigencia de la categoria", async () => {
    const { service, tx } = crearServiceParaSubirDocumento({ verificacionExistente: null });

    await service.subirDocumento("usuario-1", crearArchivoPdf(), {
      tipo: "matricula",
      oficioId: "oficio-1",
      matriculaNumero: "GAS-1",
      matriculaEnte: "ENARGAS",
      matriculaVenceEn: new Date("2030-01-01"),
    } as SubirDocumentoVerificacion);

    expect(tx.oficioProfesional.update).toHaveBeenCalledWith({
      where: { id: "oficio-1" },
      data: expect.objectContaining({ matriculaEstado: "pendiente" }),
    });
  });
});
