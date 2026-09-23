import { SetMetadata } from "@nestjs/common";
import type { RolUsuario } from "@fixeo/shared";

export const ROLES_KEY = "roles";

export const Roles = (...roles: RolUsuario[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
