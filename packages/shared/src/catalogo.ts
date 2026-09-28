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

// --- AD-04: catalogo desde el back office ---

export const crearCategoriaSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "El slug debe ser kebab-case (minusculas, numeros y guiones)",
    ),
  subcategorias: z.array(z.string().trim().min(1)).default([]),
  preguntasGuia: z.array(z.string().trim().min(1)).default([]),
  requiereMatricula: exigenciaMatriculaSchema,
});

export type CrearCategoria = z.infer<typeof crearCategoriaSchema>;

// Sin slug editable: es la clave estable de la categoria (otras partes del
// sistema la usan, p. ej. `categoria.slug === "otro"` en pedidos.service.ts),
// asi que no se cambia una vez creada.
export const editarCategoriaSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  subcategorias: z.array(z.string().trim().min(1)).optional(),
  preguntasGuia: z.array(z.string().trim().min(1)).optional(),
  requiereMatricula: exigenciaMatriculaSchema.optional(),
  activa: z.boolean().optional(),
});

export type EditarCategoria = z.infer<typeof editarCategoriaSchema>;

// D10 (docs/dominio.md §12): activar o desactivar un barrio del piloto sin
// migracion ni deploy.
export const editarBarrioSchema = z.object({
  activo: z.boolean(),
});

export type EditarBarrio = z.infer<typeof editarBarrioSchema>;

// Vistas de AD-04 (moderador/soporte): a diferencia de categoriaVistaSchema y
// barrioVistaSchema (catalogo publico, siempre filtrado a activa/activo=true,
// donde el campo seria redundante: catalogo.vistas.spec.ts exige que nunca lo
// expongan), el back office lista tambien lo desactivado y necesita ver y
// confirmar ese estado.
export const categoriaAdminVistaSchema = categoriaVistaSchema.extend({
  activa: z.boolean(),
});

export type CategoriaAdminVista = z.infer<typeof categoriaAdminVistaSchema>;

export const barrioAdminVistaSchema = barrioVistaSchema.extend({
  activo: z.boolean(),
});

export type BarrioAdminVista = z.infer<typeof barrioAdminVistaSchema>;
