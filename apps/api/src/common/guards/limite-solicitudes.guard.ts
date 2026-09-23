import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import {
  LIMITE_SOLICITUDES_KEY,
  type OpcionesLimiteSolicitudes,
} from "../decorators/limite-solicitudes.decorator.js";

interface ContadorIp {
  intentos: number;
  ventanaDesde: number;
}

// Reemplaza a @nestjs/throttler: esa dependencia hace, dentro de su propio
// bundle CJS, `require("@nestjs/common")` (paquete ESM puro en Nest 12). Bajo
// Node real eso funciona, pero el emulador de `require(esm)` de Jest 30 tira
// "Cannot require() ES Module ... in a cycle" en cuanto CUALQUIER test usa
// `@nestjs/testing` junto con `@nestjs/throttler` (reproducido con un import
// minimo, sin decorators de por medio). Como esto bloquea todo el e2e de la
// api, se reemplaza por este guard chico en memoria: alcanza para una sola
// instancia (piloto); con mas de una instancia haria falta un store
// compartido (Redis) en vez de este Map.
@Injectable()
export class LimiteSolicitudesGuard implements CanActivate {
  private readonly contadoresPorClave = new Map<string, ContadorIp>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opciones = this.reflector.get<OpcionesLimiteSolicitudes | undefined>(
      LIMITE_SOLICITUDES_KEY,
      context.getHandler(),
    );
    if (!opciones) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const clave = `${context.getHandler().name}:${request.ip}`;
    const ahora = Date.now();
    this.podarVencidos(opciones.ventanaMs, ahora);
    const contador = this.contadoresPorClave.get(clave);

    if (!contador || ahora - contador.ventanaDesde > opciones.ventanaMs) {
      this.contadoresPorClave.set(clave, { intentos: 1, ventanaDesde: ahora });
      return true;
    }

    if (contador.intentos >= opciones.maximo) {
      throw new HttpException(
        { codigo: "limite_excedido", mensaje: "Demasiadas solicitudes, esperá unos minutos" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    contador.intentos += 1;
    return true;
  }

  /** Evita que el Map crezca sin techo: las claves las controla quien pega (IP). */
  private podarVencidos(ventanaMs: number, ahora: number): void {
    for (const [clave, contador] of this.contadoresPorClave) {
      if (ahora - contador.ventanaDesde > ventanaMs) {
        this.contadoresPorClave.delete(clave);
      }
    }
  }
}
