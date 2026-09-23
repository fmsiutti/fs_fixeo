import { describe, expect, it, jest } from "@jest/globals";
import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  type ArgumentsHost,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import { z } from "zod";
import { FiltroErrores } from "./errores.filter.js";

function crearHost(): { host: ArgumentsHost; response: Response } {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe("FiltroErrores", () => {
  it("traduce un error de validacion zod a { codigo: 'validacion', detalles: issues[] }", () => {
    const filtro = new FiltroErrores();
    const { host, response } = crearHost();
    const resultado = z.object({ telefono: z.string() }).safeParse({});
    const excepcion = new ZodValidationException(resultado.error);

    filtro.catch(excepcion, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const cuerpo = (response.json as jest.Mock).mock.calls[0]?.[0] as {
      codigo: string;
      detalles: unknown;
    };
    expect(cuerpo.codigo).toBe("validacion");
    expect(Array.isArray(cuerpo.detalles)).toBe(true);
  });

  it("deja pasar tal cual una excepcion que ya trae { codigo, mensaje } armado a mano", () => {
    const filtro = new FiltroErrores();
    const { host, response } = crearHost();
    const excepcion = new ForbiddenException({ codigo: "cuenta_suspendida", mensaje: "Nop" });

    filtro.catch(excepcion, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(response.json).toHaveBeenCalledWith({ codigo: "cuenta_suspendida", mensaje: "Nop" });
  });

  it("mapea una HttpException 4xx generica de Nest segun su status", () => {
    const filtro = new FiltroErrores();
    const { host, response } = crearHost();
    const excepcion = new ConflictException("choque");

    filtro.catch(excepcion, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({ codigo: "conflicto", mensaje: "choque" });
  });

  it("un 5xx (ej. InternalServerErrorException) se loguea y responde el mensaje generico, nunca el interno", () => {
    const filtro = new FiltroErrores();
    const { host, response } = crearHost();
    const loggerSpy = jest.spyOn(Logger(filtro), "error").mockImplementation(() => undefined);
    const excepcion = new InternalServerErrorException(
      'No existe el parametro de negocio "clave_secreta_interna"',
    );

    filtro.catch(excepcion, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      codigo: "error_interno",
      mensaje: "Ocurrio un error inesperado",
    });
    expect(loggerSpy).toHaveBeenCalled();
    const logueado = loggerSpy.mock.calls[0]?.[0] as string;
    expect(logueado).not.toContain("clave_secreta_interna");
  });

  it("una excepcion que no es HttpException cae al catch-all: 500 generico y se loguea", () => {
    const filtro = new FiltroErrores();
    const { host, response } = crearHost();
    const loggerSpy = jest.spyOn(Logger(filtro), "error").mockImplementation(() => undefined);

    filtro.catch(new Error("boom interno con detalle sensible"), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith({
      codigo: "error_interno",
      mensaje: "Ocurrio un error inesperado",
    });
    const logueado = loggerSpy.mock.calls[0]?.[0] as string;
    expect(logueado).not.toContain("boom interno con detalle sensible");
  });
});

// El logger es una propiedad privada de la clase; se accede por reflexion
// para poder espiarlo sin exponerlo como publico solo para testear.
function Logger(filtro: FiltroErrores): { error: (...args: unknown[]) => void } {
  return (filtro as unknown as { logger: { error: (...args: unknown[]) => void } }).logger;
}
