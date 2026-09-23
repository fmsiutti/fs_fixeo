import { describe, expect, it, jest } from "@jest/globals";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

const SECRET = "secreto-de-test";

function crearConfigService(): ConfigService<Env, true> {
  return { get: jest.fn().mockReturnValue(SECRET) } as unknown as ConfigService<Env, true>;
}

function crearUsuario(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: "usuario-1",
    telefono: "+5491100000099",
    nombre: null,
    apellido: null,
    email: null,
    fotoUrl: null,
    rolActivo: null,
    estado: "activo",
    creadoEn: new Date(),
    ultimoAcceso: null,
    ...overrides,
  } as Usuario;
}

function crearPrismaConUsuario(usuario: Usuario | null) {
  return {
    usuario: { findUnique: jest.fn<() => Promise<Usuario | null>>().mockResolvedValue(usuario) },
  };
}

function crearContexto(headers: Record<string, string | undefined>) {
  const request = { headers, usuario: undefined } as unknown as Request & { usuario?: Usuario };
  const contexto = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { contexto, request };
}

describe("JwtAuthGuard", () => {
  it("deja pasar un token valido y adjunta el usuario al request", async () => {
    const jwtService = new JwtService();
    const token = await jwtService.signAsync({ sub: "usuario-1" }, { secret: SECRET });
    const prisma = crearPrismaConUsuario(crearUsuario());
    const guard = new JwtAuthGuard(
      jwtService,
      crearConfigService(),
      prisma as unknown as PrismaService,
    );
    const { contexto, request } = crearContexto({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(request.usuario?.id).toBe("usuario-1");
  });

  it("rechaza si falta el header de autorizacion", async () => {
    const guard = new JwtAuthGuard(new JwtService(), crearConfigService(), {} as PrismaService);
    const { contexto } = crearContexto({});

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rechaza un header sin el prefijo 'Bearer '", async () => {
    const guard = new JwtAuthGuard(new JwtService(), crearConfigService(), {} as PrismaService);
    const { contexto } = crearContexto({ authorization: "Token abc123" });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rechaza 'Bearer' sin token", async () => {
    const guard = new JwtAuthGuard(new JwtService(), crearConfigService(), {} as PrismaService);
    const { contexto } = crearContexto({ authorization: "Bearer " });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rechaza un jwt firmado con otro secret", async () => {
    const jwtService = new JwtService();
    const tokenFalso = await jwtService.signAsync({ sub: "usuario-1" }, { secret: "otro-secreto" });
    const prisma = { usuario: { findUnique: jest.fn() } };
    const guard = new JwtAuthGuard(
      jwtService,
      crearConfigService(),
      prisma as unknown as PrismaService,
    );
    const { contexto } = crearContexto({ authorization: `Bearer ${tokenFalso}` });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
  });

  it("rechaza si el usuario asociado al token ya no esta activo", async () => {
    const jwtService = new JwtService();
    const token = await jwtService.signAsync({ sub: "usuario-1" }, { secret: SECRET });
    const prisma = crearPrismaConUsuario(crearUsuario({ estado: "eliminado" }));
    const guard = new JwtAuthGuard(
      jwtService,
      crearConfigService(),
      prisma as unknown as PrismaService,
    );
    const { contexto } = crearContexto({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rechaza si el usuario del token ya no existe", async () => {
    const jwtService = new JwtService();
    const token = await jwtService.signAsync({ sub: "usuario-inexistente" }, { secret: SECRET });
    const prisma = crearPrismaConUsuario(null);
    const guard = new JwtAuthGuard(
      jwtService,
      crearConfigService(),
      prisma as unknown as PrismaService,
    );
    const { contexto } = crearContexto({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
