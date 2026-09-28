import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import type { CodigoError } from "@fixeo/shared";

interface CuerpoErrorApi {
  codigo: CodigoError;
  mensaje: string;
  detalles?: unknown;
}

function esCuerpoErrorApi(valor: unknown): valor is CuerpoErrorApi {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as { codigo?: unknown }).codigo === "string" &&
    typeof (valor as { mensaje?: unknown }).mensaje === "string"
  );
}

const CODIGO_POR_STATUS: Partial<Record<number, CodigoError>> = {
  [HttpStatus.BAD_REQUEST]: "validacion",
  [HttpStatus.UNAUTHORIZED]: "no_autenticado",
  [HttpStatus.FORBIDDEN]: "no_autorizado",
  [HttpStatus.NOT_FOUND]: "no_encontrado",
  [HttpStatus.CONFLICT]: "conflicto",
  [HttpStatus.TOO_MANY_REQUESTS]: "limite_excedido",
  // Fix 5, revision de codigo del slice 10: `FileInterceptor` de Nest ya
  // traduce el error crudo de Multer por `limits.fileSize`
  // (`.code === "LIMIT_FILE_SIZE"`) a un `PayloadTooLargeException` propio
  // (`transformException` en @nestjs/platform-express), asi que llega aca
  // como HttpException con status 413, no al catch-all. Sin esta entrada,
  // el fallback de mas abajo lo devolvia como "error_interno" por no tener
  // un codigo mas especifico para 413.
  [HttpStatus.PAYLOAD_TOO_LARGE]: "validacion",
};

/**
 * Traduce cualquier excepcion (zod, HttpException de Nest, o lo que sea) al
 * contrato { codigo, mensaje } de errorApiSchema (packages/shared), para que
 * el front siempre pueda mapear `codigo` a un texto propio, tal como pide
 * apps/web/CLAUDE.md. Sin este filtro, un 400 de validacion o un 401/403/404
 * generico de Nest le llegan al front con un shape distinto y caen al error
 * generico sin `codigo`.
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErrores.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodValidationException) {
      const errorZod = exception.getZodError();
      const issues =
        typeof errorZod === "object" && errorZod !== null && "issues" in errorZod
          ? errorZod.issues
          : undefined;
      response.status(HttpStatus.BAD_REQUEST).json({
        codigo: "validacion",
        mensaje: "Los datos enviados no son validos",
        detalles: issues,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const cuerpo = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        // Un 5xx es una falla nuestra (config, bug, etc.), no un error del
        // cliente: se loguea (sin el mensaje interno, puede describir detalle
        // de infraestructura) y se responde el mismo texto generico del
        // catch-all de abajo, nunca `exception.message`.
        this.logger.error(`Error interno: ${exception.constructor.name} (status ${status})`);
        response.status(status).json({
          codigo: "error_interno",
          mensaje: "Ocurrio un error inesperado",
        });
        return;
      }

      if (esCuerpoErrorApi(cuerpo)) {
        response.status(status).json(cuerpo);
        return;
      }
      response.status(status).json({
        codigo: CODIGO_POR_STATUS[status] ?? "error_interno",
        mensaje: typeof cuerpo === "string" ? cuerpo : exception.message,
      });
      return;
    }

    // Fix 5 (defensa adicional): si algun dia un error crudo de Multer
    // (`.code === "LIMIT_FILE_SIZE"`, no una HttpException de Nest) llega
    // directo aca sin pasar por `transformException` de
    // @nestjs/platform-express (ver CODIGO_POR_STATUS arriba, que cubre el
    // camino real de hoy), lo mapeamos igual a 413/"validacion" por
    // duck-typing, sin agregar `multer` como dependencia nueva.
    if (exception instanceof Error && (exception as { code?: string }).code === "LIMIT_FILE_SIZE") {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        codigo: "validacion",
        mensaje: "El archivo es demasiado grande",
      });
      return;
    }

    // No logueamos el mensaje completo ni el stack: un PrismaClientValidationError,
    // por ejemplo, incluye los argumentos de la query en su mensaje (podria haber
    // un telefono ahi), y CLAUDE.md prohibe PII en logs sin excepcion de entorno.
    this.logger.error(
      `Error no controlado: ${exception instanceof Error ? exception.constructor.name : typeof exception}`,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      codigo: "error_interno",
      mensaje: "Ocurrio un error inesperado",
    });
  }
}
