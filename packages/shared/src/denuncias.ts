import { z } from "zod";
import { tipoObjetoDenunciaSchema } from "./estados.js";

// PR-03 (slice 5): el unico origen habilitado por ahora es el pedido; las
// demas pantallas con boton "denunciar" (postulacion, perfil, resenia) se
// conectan a este mismo endpoint cuando existan (docs/dominio.md §11 y §15).
export const crearDenunciaSchema = z.object({
  tipoObjeto: tipoObjetoDenunciaSchema,
  objetoId: z.string().uuid(),
  motivo: z.string().trim().min(1, "Falta el motivo").max(120),
  detalle: z.string().trim().min(1).max(1000).optional(),
});

export type CrearDenuncia = z.infer<typeof crearDenunciaSchema>;
