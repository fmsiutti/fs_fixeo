import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { Usuario } from "../../generated/prisma/client.js";

/** Usuario autenticado, adjuntado por JwtAuthGuard. Usar solo detras del guard. */
export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Usuario => {
    const request = ctx.switchToHttp().getRequest<Request & { usuario: Usuario }>();
    return request.usuario;
  },
);
