import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { ProveedorOtp } from "../../infra/twilio/proveedor-otp.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { AuthService } from "./auth.service.js";

const SECRET = "secreto-de-test";

function crearUsuario(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    telefono: "+5491100000001",
    nombre: null,
    apellido: null,
    email: null,
    fotoUrl: null,
    rolActivo: null,
    estado: "activo",
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    ultimoAcceso: null,
    ...overrides,
  } as Usuario;
}

interface RegistroRefreshToken {
  id: string;
  usuarioId: string;
  tokenHash: string;
  creadoEn: Date;
  expiraEn: Date;
  revocadoEn: Date | null;
}

function crearRefreshTokenRegistro(
  overrides: Partial<RegistroRefreshToken> = {},
): RegistroRefreshToken {
  return {
    id: "refresh-1",
    usuarioId: "11111111-1111-1111-1111-111111111111",
    tokenHash: "hash-cualquiera",
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    expiraEn: new Date(Date.now() + 1000 * 60 * 60),
    revocadoEn: null,
    ...overrides,
  };
}

function crearConfigService(): ConfigService<Env, true> {
  return {
    get: jest.fn((clave: string) => (clave === "JWT_ACCESS_SECRET" ? SECRET : undefined)),
  } as unknown as ConfigService<Env, true>;
}

function crearProveedorOtpMock(): jest.Mocked<ProveedorOtp> {
  return {
    enviarCodigo: jest.fn<ProveedorOtp["enviarCodigo"]>().mockResolvedValue(undefined),
    verificarCodigo: jest.fn<ProveedorOtp["verificarCodigo"]>().mockResolvedValue(true),
  };
}

type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

// $transaction se usa aca en su forma "callback interactivo": el mock invoca
// el callback pasandole el mismo objeto prisma (es lo unico que el service
// necesita de un "tx").
function crearPrismaMock() {
  const prisma: {
    usuario: {
      upsert: jest.Mock<(args: unknown) => Promise<Usuario>>;
      findUnique: jest.Mock<(args: unknown) => Promise<Usuario | null>>;
      update: jest.Mock<(args: unknown) => Promise<Usuario>>;
    };
    refreshToken: {
      create: jest.Mock<(args: unknown) => Promise<RegistroRefreshToken>>;
      findUnique: jest.Mock<(args: unknown) => Promise<RegistroRefreshToken | null>>;
      updateMany: jest.Mock<(args: unknown) => Promise<{ count: number }>>;
    };
    $transaction: jest.Mock<(callback: CallbackTransaccion) => Promise<unknown>>;
  } = {
    usuario: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(prisma));
  // Por default, la revocacion atomica de refrescar() "gana la carrera".
  prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  return prisma;
}

type PrismaMock = ReturnType<typeof crearPrismaMock>;

function crearService(
  overrides: {
    prisma?: PrismaMock;
    jwtService?: JwtService;
    configService?: ConfigService<Env, true>;
    proveedorOtp?: jest.Mocked<ProveedorOtp>;
  } = {},
) {
  const prisma = overrides.prisma ?? crearPrismaMock();
  const jwtService = overrides.jwtService ?? new JwtService();
  const configService = overrides.configService ?? crearConfigService();
  const proveedorOtp = overrides.proveedorOtp ?? crearProveedorOtpMock();
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwtService,
    configService,
    proveedorOtp,
  );
  return { service, prisma, jwtService, proveedorOtp };
}

/** Ejecuta una promesa que se espera rechazada y devuelve el error para inspeccionarlo. */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
  } catch (error) {
    return error;
  }
  throw new Error("Se esperaba que la promesa rechazara, pero se resolvio.");
}

describe("AuthService", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("solicitarOtp", () => {
    it("llama al proveedor de otp con el telefono y el canal pedidos", async () => {
      const { service, proveedorOtp } = crearService();

      await service.solicitarOtp("+5491100000001", "sms");

      expect(proveedorOtp.enviarCodigo).toHaveBeenCalledWith("+5491100000001", "sms");
    });

    it("corta la cuarta solicitud del mismo telefono dentro de la ventana de 10 minutos", async () => {
      jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
      const { service, proveedorOtp } = crearService();
      const telefono = "+5491100000002";

      await service.solicitarOtp(telefono, "sms");
      await service.solicitarOtp(telefono, "sms");
      await service.solicitarOtp(telefono, "sms");
      const error = await capturarError(service.solicitarOtp(telefono, "sms"));

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect((error as HttpException).getResponse()).toMatchObject({
        codigo: "limite_excedido",
      });
      expect(proveedorOtp.enviarCodigo).toHaveBeenCalledTimes(3);
    });

    it("resetea el contador de intentos pasada la ventana de 10 minutos", async () => {
      jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
      const { service, proveedorOtp } = crearService();
      const telefono = "+5491100000003";

      await service.solicitarOtp(telefono, "sms");
      await service.solicitarOtp(telefono, "sms");
      await service.solicitarOtp(telefono, "sms");
      jest.advanceTimersByTime(10 * 60 * 1000 + 1);

      await expect(service.solicitarOtp(telefono, "sms")).resolves.toBeUndefined();
      expect(proveedorOtp.enviarCodigo).toHaveBeenCalledTimes(4);
    });

    it("no mezcla los contadores de telefonos distintos", async () => {
      jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
      const { service } = crearService();
      const telefonoA = "+5491100000004";
      const telefonoB = "+5491100000005";

      await service.solicitarOtp(telefonoA, "sms");
      await service.solicitarOtp(telefonoA, "sms");
      await service.solicitarOtp(telefonoA, "sms");

      // B no deberia verse afectado por los 3 intentos de A.
      await expect(service.solicitarOtp(telefonoB, "sms")).resolves.toBeUndefined();
    });
  });

  describe("confirmarOtp", () => {
    it("rechaza un codigo invalido con otp_invalido", async () => {
      const { service, proveedorOtp } = crearService();
      proveedorOtp.verificarCodigo.mockResolvedValue(false);

      const error = await capturarError(service.confirmarOtp("+5491100000006", "000000"));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        codigo: "otp_invalido",
      });
    });

    it("crea un usuario nuevo con rolActivo null y emite tokens validos cuando el telefono no existia", async () => {
      const prisma = crearPrismaMock();
      const telefono = "+5491100000007";
      const usuarioCreado = crearUsuario({ telefono, rolActivo: null });
      prisma.usuario.upsert.mockResolvedValue(usuarioCreado);
      const jwtService = new JwtService();
      const { service } = crearService({ prisma, jwtService });

      const sesion = await service.confirmarOtp(telefono, "123456");

      expect(prisma.usuario.upsert).toHaveBeenCalledWith({
        where: { telefono },
        update: { ultimoAcceso: expect.any(Date) },
        create: { telefono, ultimoAcceso: expect.any(Date) },
      });
      expect(sesion.usuario.rolActivo).toBeNull();

      // El access token es un jwt real, verificable con el mismo secret, con sub y rol.
      const payload = await jwtService.verifyAsync<{ sub: string; rol: string | null }>(
        sesion.accessToken,
        { secret: SECRET },
      );
      expect(payload).toMatchObject({ sub: usuarioCreado.id, rol: null });

      // Seguridad: en la base solo se guarda el hash del refresh token, nunca el valor plano.
      const [creacionRefresh] = prisma.refreshToken.create.mock.calls[0] as [
        { data: { tokenHash: string } },
      ];
      expect(creacionRefresh.data.tokenHash).not.toBe(sesion.refreshTokenPlano);
      expect(creacionRefresh.data.tokenHash).toBe(
        createHash("sha256").update(sesion.refreshTokenPlano).digest("hex"),
      );
    });

    it("actualiza ultimoAcceso sin duplicar el usuario cuando el telefono ya existia", async () => {
      const prisma = crearPrismaMock();
      const usuarioExistente = crearUsuario({ telefono: "+5491100000008", rolActivo: "cliente" });
      prisma.usuario.upsert.mockResolvedValue(usuarioExistente);
      const { service } = crearService({ prisma });

      const sesion = await service.confirmarOtp(usuarioExistente.telefono, "123456");

      expect(prisma.usuario.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.usuario.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { telefono: usuarioExistente.telefono } }),
      );
      expect(sesion.usuario.id).toBe(usuarioExistente.id);
      expect(sesion.usuario.rolActivo).toBe("cliente");
    });

    it("rechaza con cuenta_suspendida y no emite tokens si el usuario no esta activo", async () => {
      const prisma = crearPrismaMock();
      const usuarioSuspendido = crearUsuario({
        telefono: "+5491100000009",
        estado: "suspendido",
      });
      prisma.usuario.upsert.mockResolvedValue(usuarioSuspendido);
      const { service } = crearService({ prisma });

      const error = await capturarError(service.confirmarOtp(usuarioSuspendido.telefono, "123456"));

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        codigo: "cuenta_suspendida",
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it("corta el sexto intento de confirmar con codigo invalido para el mismo telefono", async () => {
      jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
      const { service, proveedorOtp } = crearService();
      proveedorOtp.verificarCodigo.mockResolvedValue(false);
      const telefono = "+5491100000030";

      for (let intento = 0; intento < 5; intento += 1) {
        await capturarError(service.confirmarOtp(telefono, "000000"));
      }
      const error = await capturarError(service.confirmarOtp(telefono, "000000"));

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      // Al 6to intento ni siquiera se vuelve a consultar al proveedor de otp.
      expect(proveedorOtp.verificarCodigo).toHaveBeenCalledTimes(5);
    });

    it("un codigo correcto no cuenta contra el limite de intentos fallidos de confirmar", async () => {
      const prisma = crearPrismaMock();
      const telefono = "+5491100000031";
      prisma.usuario.upsert.mockResolvedValue(crearUsuario({ telefono }));
      const { service, proveedorOtp } = crearService({ prisma });

      await service.confirmarOtp(telefono, "123456");
      // Si el intento correcto hubiera contado, esto seguiria teniendo margen
      // de sobra (el limite es 5); lo relevante es que no rechace.
      proveedorOtp.verificarCodigo.mockResolvedValue(false);
      const error = await capturarError(service.confirmarOtp(telefono, "000000"));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        codigo: "otp_invalido",
      });
    });
  });

  describe("refrescar", () => {
    it("rota el refresh token: revoca el usado (de forma atomica) y crea uno nuevo con hash distinto", async () => {
      const prisma = crearPrismaMock();
      const usuario = crearUsuario();
      const planoUsado = "token-plano-valido";
      const hashUsado = createHash("sha256").update(planoUsado).digest("hex");
      prisma.refreshToken.findUnique.mockResolvedValue(
        crearRefreshTokenRegistro({ tokenHash: hashUsado, usuarioId: usuario.id }),
      );
      prisma.usuario.findUnique.mockResolvedValue(usuario);
      prisma.usuario.update.mockResolvedValue(usuario);
      const { service } = crearService({ prisma });

      const sesion = await service.refrescar(planoUsado);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "refresh-1", revocadoEn: null },
        data: { revocadoEn: expect.any(Date) },
      });
      const [creacion] = prisma.refreshToken.create.mock.calls[0] as [
        { data: { tokenHash: string } },
      ];
      expect(creacion.data.tokenHash).not.toBe(hashUsado);
      expect(sesion.refreshTokenPlano).not.toBe(planoUsado);
    });

    it("si el token ya fue usado (carrera perdida en la revocacion atomica), rechaza y revoca todas las sesiones del usuario", async () => {
      const prisma = crearPrismaMock();
      const usuario = crearUsuario();
      prisma.refreshToken.findUnique.mockResolvedValue(
        crearRefreshTokenRegistro({ usuarioId: usuario.id }),
      );
      prisma.usuario.findUnique.mockResolvedValue(usuario);
      // Alguien mas ya roto este mismo token entre el findUnique y la transaccion.
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      const { service } = crearService({ prisma });

      const error = await capturarError(service.refrescar("token-plano-valido"));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        codigo: "refresh_invalido",
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      // Revoca TODAS las sesiones del usuario, no solo la que fallo: reuso de
      // un refresh token ya usado es la señal clasica de una cookie robada.
      expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith({
        where: { usuarioId: usuario.id, revocadoEn: null },
        data: { revocadoEn: expect.any(Date) },
      });
    });

    it("rechaza un refresh token ya revocado con refresh_invalido", async () => {
      const prisma = crearPrismaMock();
      prisma.refreshToken.findUnique.mockResolvedValue(
        crearRefreshTokenRegistro({ revocadoEn: new Date() }),
      );
      const { service, prisma: prismaUsado } = crearService({ prisma });

      const error = await capturarError(service.refrescar("token-cualquiera"));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        codigo: "refresh_invalido",
      });
      expect(prismaUsado.refreshToken.create).not.toHaveBeenCalled();
    });

    it("rechaza un refresh token vencido con refresh_invalido", async () => {
      const prisma = crearPrismaMock();
      prisma.refreshToken.findUnique.mockResolvedValue(
        crearRefreshTokenRegistro({ expiraEn: new Date(Date.now() - 1000) }),
      );
      const { service } = crearService({ prisma });

      const error = await capturarError(service.refrescar("token-cualquiera"));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        codigo: "refresh_invalido",
      });
    });

    it("rechaza el refresh si el usuario ya no esta activo, aunque el token sea valido", async () => {
      const prisma = crearPrismaMock();
      prisma.refreshToken.findUnique.mockResolvedValue(crearRefreshTokenRegistro());
      prisma.usuario.findUnique.mockResolvedValue(crearUsuario({ estado: "eliminado" }));
      const { service } = crearService({ prisma });

      const error = await capturarError(service.refrescar("token-cualquiera"));

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        codigo: "refresh_invalido",
      });
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("cerrarSesion", () => {
    it("revoca el refresh token correspondiente al hash del token plano", async () => {
      const { service, prisma } = crearService();

      await service.cerrarSesion("token-plano");

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          tokenHash: createHash("sha256").update("token-plano").digest("hex"),
          revocadoEn: null,
        },
        data: { revocadoEn: expect.any(Date) },
      });
    });

    it("no hace nada si se llama sin token", async () => {
      const { service, prisma } = crearService();

      await expect(service.cerrarSesion(undefined)).resolves.toBeUndefined();

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
