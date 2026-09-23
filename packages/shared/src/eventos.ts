import { z } from "zod";

// Solo los eventos que puede disparar el cliente desde el asistente de
// publicacion, todavia sin sesion (docs/dominio.md §10). El resto
// (pedido_publicado, limite_alcanzado, etc.) los registra el backend directo
// desde el service que ya conoce el contexto completo: no hace falta, y no
// conviene, que el cliente los pueda disparar el mismo por esta via.
export const TIPOS_EVENTO_CLIENTE = ["asistente_iniciado", "asistente_paso_completado"] as const;

// Pasos del asistente que ya existen en este slice (CL-02 a CL-05); "revisar"
// no manda paso_completado propio, lo cubre el evento pedido_publicado.
export const PASOS_ASISTENTE = ["que", "problema", "donde", "cuando"] as const;

// A proposito solo ids, nunca texto libre: "categoria" y "zona" en
// evento_analitico tienen que ser siempre valores reales del catalogo (el
// backend resuelve slug/nombre), no lo que quiera mandar un cliente anonimo a
// un endpoint publico sin autenticacion.
export const registrarEventoSchema = z.object({
  tipo: z.enum(TIPOS_EVENTO_CLIENTE),
  categoriaId: z.string().uuid().optional(),
  barrioId: z.string().uuid().optional(),
  paso: z.enum(PASOS_ASISTENTE).optional(),
});

export type RegistrarEvento = z.infer<typeof registrarEventoSchema>;
