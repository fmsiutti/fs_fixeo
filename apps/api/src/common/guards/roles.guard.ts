import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RolUsuario } from "@fixeo/shared";
import type { Request } from "express";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import type { Usuario } from "../../generated/prisma/client.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesRequeridos || rolesRequeridos.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { usuario?: Usuario }>();
    const rolActivo = request.usuario?.rolActivo;
    if (!rolActivo || !rolesRequeridos.includes(rolActivo)) {
      throw new ForbiddenException({
        codigo: "no_autorizado",
        mensaje: "No tenes permiso para esta accion",
      });
    }
    return true;
  }
}
