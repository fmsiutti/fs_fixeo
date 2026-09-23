import { describe, expect, it } from "@jest/globals";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Usuario } from "../../generated/prisma/client.js";
import { Roles } from "../decorators/roles.decorator.js";
import { RolesGuard } from "./roles.guard.js";

/** Controller minimo, solo para poder decorar un metodo real con @Roles y leerlo con Reflector real. */
class ControladorDePrueba {
  @Roles("moderador")
  soloModerador(): string {
    return "ok";
  }

  sinRoles(): string {
    return "ok";
  }
}

function crearContexto(
  usuario: Partial<Usuario> | undefined,
  metodo: keyof ControladorDePrueba,
): ExecutionContext {
  const instancia = new ControladorDePrueba();
  const request = { usuario } as unknown as Request & { usuario?: Usuario };
  return {
    getHandler: () => instancia[metodo],
    getClass: () => ControladorDePrueba,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  it("deja pasar si el handler no tiene @Roles", () => {
    const contexto = crearContexto(undefined, "sinRoles");

    expect(guard.canActivate(contexto)).toBe(true);
  });

  it("rechaza a un usuario cuyo rol activo no esta en @Roles('moderador')", () => {
    const contexto = crearContexto({ rolActivo: "cliente" } as Usuario, "soloModerador");

    expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
  });

  it("deja pasar a un usuario con el rol activo requerido", () => {
    const contexto = crearContexto({ rolActivo: "moderador" } as Usuario, "soloModerador");

    expect(guard.canActivate(contexto)).toBe(true);
  });

  it("rechaza si no hay usuario autenticado en el request", () => {
    const contexto = crearContexto(undefined, "soloModerador");

    expect(() => guard.canActivate(contexto)).toThrow(ForbiddenException);
  });
});
