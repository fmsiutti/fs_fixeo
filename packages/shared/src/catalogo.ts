import { z } from "zod";
import { exigenciaMatriculaSchema } from "./estados.js";

export const categoriaVistaSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  slug: z.string(),
  subcategorias: z.array(z.string()),
  preguntasGuia: z.array(z.string()),
  requiereMatricula: exigenciaMatriculaSchema,
});

export type CategoriaVista = z.infer<typeof categoriaVistaSchema>;

export const barrioVistaSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
});

export type BarrioVista = z.infer<typeof barrioVistaSchema>;
