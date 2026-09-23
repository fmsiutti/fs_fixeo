import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { Env } from "../../config/env.schema.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { Usuario } from "../../generated/prisma/client.js";

interface AccessTokenPayload {
  sub: string;
}

const SIN_SESION = { codigo: "no_autenticado" as const, mensaje: "Falta iniciar sesion" };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { usuario?: Usuario }>();
    const token = this.extraerToken(request);
    if (!token) {
      throw new UnauthorizedException(SIN_SESION);
    }

    const secret = this.configService.get("JWT_ACCESS_SECRET", { infer: true });
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException(SIN_SESION);
    }

    // No confiamos en el rol del payload viejo: se relee de la base en cada request.
    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || usuario.estado !== "activo") {
      throw new UnauthorizedException(SIN_SESION);
    }

    request.usuario = usuario;
    return true;
  }

  private extraerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
}
