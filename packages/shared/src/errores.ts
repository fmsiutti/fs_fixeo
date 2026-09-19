import { z } from "zod";

export const CODIGOS_ERROR = [
  "validacion",
  "no_autenticado",
  "no_autorizado",
  "no_encontrado",
  "conflicto",
  "limite_excedido",
  "error_interno",
] as const;

export const codigoErrorSchema = z.enum(CODIGOS_ERROR);

export type CodigoError = z.infer<typeof codigoErrorSchema>;

export const errorApiSchema = z.object({
  codigo: codigoErrorSchema,
  mensaje: z.string(),
  detalles: z.unknown().optional(),
});

export type ErrorApi = z.infer<typeof errorApiSchema>;
