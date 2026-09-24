import { z } from "zod";

// CL-11: puntaje 1 a 5, atributos libres cortos ("puntual", "prolijo", "claro
// con el precio"), comentario y monto declarado opcionales. Se manda solo
// dentro de cerrarPedidoSchema (pedidos.ts) cuando desenlace es
// "lo_hizo_este_profesional"; nunca es su propio endpoint de creacion
// (docs/dominio.md §8: la resenia nace junto con el cierre del pedido).
const MENSAJE_PUNTAJE = "Elegí un puntaje de 1 a 5 estrellas";

export const reseniaAlCerrarSchema = z.object({
  puntaje: z
    .number(MENSAJE_PUNTAJE)
    .int(MENSAJE_PUNTAJE)
    .min(1, MENSAJE_PUNTAJE)
    .max(5, MENSAJE_PUNTAJE),
  atributos: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  comentario: z
    .string()
    .trim()
    .min(1)
    .max(1000, "El comentario es demasiado largo (máximo 1000 caracteres)")
    .optional(),
  // Dinero en enteros de pesos (CLAUDE.md, "dinero en Int, nunca float").
  // Privado: docs/dominio.md §8, "el monto final declarado es privado y solo
  // alimenta rangos de referencia" — nunca se expone en ReseniaVista.
  montoDeclarado: z
    .number()
    .int("El monto tiene que ser un número entero, sin centavos")
    .positive("El monto tiene que ser mayor a cero")
    .optional(),
});

export type ReseniaAlCerrar = z.infer<typeof reseniaAlCerrarSchema>;

// docs/dominio.md §8: "el profesional puede responder una vez, publicamente".
export const responderReseniaSchema = z.object({
  respuesta: z.string().trim().min(1).max(1000, "La respuesta es demasiado larga"),
});

export type ResponderResenia = z.infer<typeof responderReseniaSchema>;

// CL-09/PR-07: "se publica con nombre de pila, inicial del apellido,
// categoria y fecha" (docs/dominio.md §8). Nunca el apellido completo, nunca
// datos del cliente mas alla de eso, nunca `montoDeclarado` (privado).
export const reseniaVistaSchema = z.object({
  id: z.string().uuid(),
  cliente: z.object({
    nombre: z.string().nullable(),
    inicialApellido: z.string().nullable(),
  }),
  categoria: z.object({
    nombre: z.string(),
    slug: z.string(),
  }),
  puntaje: z.number(),
  atributos: z.array(z.string()),
  comentario: z.string().nullable(),
  respuestaProfesional: z.string().nullable(),
  publicadaEn: z.string(),
});

export type ReseniaVista = z.infer<typeof reseniaVistaSchema>;

// Listado paginado por cursor (CLAUDE.md, "listados paginados por cursor,
// nunca colecciones sin limite"), para CL-09 y PR-07.
export const reseniaPaginaSchema = z.object({
  items: z.array(reseniaVistaSchema),
  cursor: z.string().uuid().nullable(),
});

export type ReseniaPagina = z.infer<typeof reseniaPaginaSchema>;

export const listarReseniasQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
});

export type ListarReseniasQuery = z.infer<typeof listarReseniasQuerySchema>;
