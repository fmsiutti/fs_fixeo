import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { HttpException, HttpStatus, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { LimiteSolicitudes } from "../decorators/limite-solicitudes.decorator.js";
import { LimiteSolicitudesGuard } from "./limite-solicitudes.guard.js";

/** Controller minimo para decorar un handler real con @LimiteSolicitudes y leerlo con Reflector real. */
class ControladorDePrueba {
  @LimiteSolicitudes({ maximo: 3, ventanaMs: 60_000 })
  conLimite(): string {
    return "ok";
  }

  sinLimite(): string {
    return "ok";
  }
}

function crearContexto(ip: string, metodo: keyof ControladorDePrueba): ExecutionContext {
  const instancia = new ControladorDePrueba();
  return {
    getHandler: () => instancia[metodo],
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

describe("LimiteSolicitudesGuard", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("deja pasar siempre si el handler no tiene @LimiteSolicitudes", () => {
    const guard = new LimiteSolicitudesGuard(new Reflector());

    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(crearContexto("1.1.1.1", "sinLimite"))).toBe(true);
    }
  });

  it("corta al superar el maximo dentro de la ventana", () => {
    const guard = new LimiteSolicitudesGuard(new Reflector());
    const contexto = () => crearContexto("2.2.2.2", "conLimite");

    expect(guard.canActivate(contexto())).toBe(true);
    expect(guard.canActivate(contexto())).toBe(true);
    expect(guard.canActivate(contexto())).toBe(true);
    expect(() => guard.canActivate(contexto())).toThrow(HttpException);
    try {
      guard.canActivate(contexto());
      throw new Error("se esperaba que canActivate tirara");
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it("dos ips distintas no se afectan entre si", () => {
    const guard = new LimiteSolicitudesGuard(new Reflector());

    guard.canActivate(crearContexto("3.3.3.3", "conLimite"));
    guard.canActivate(crearContexto("3.3.3.3", "conLimite"));
    guard.canActivate(crearContexto("3.3.3.3", "conLimite"));
    expect(() => guard.canActivate(crearContexto("3.3.3.3", "conLimite"))).toThrow(HttpException);

    // La otra IP arranca de cero, aunque pegue al mismo handler.
    expect(guard.canActivate(crearContexto("4.4.4.4", "conLimite"))).toBe(true);
  });

  it("resetea el contador pasada la ventana", () => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
    const guard = new LimiteSolicitudesGuard(new Reflector());
    const contexto = () => crearContexto("5.5.5.5", "conLimite");

    guard.canActivate(contexto());
    guard.canActivate(contexto());
    guard.canActivate(contexto());
    jest.advanceTimersByTime(60_001);

    expect(guard.canActivate(contexto())).toBe(true);
  });
});
