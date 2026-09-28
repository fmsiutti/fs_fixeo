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

// Motivos de denuncia de una resenia (docs/dominio.md §8, AD-02/slice 9). A
// diferencia de pedido/perfil/postulacion (motivo libre arriba), aca si hace
// falta una lista tipificada compartida: el backend tiene que reaccionar
// programaticamente al motivo (ocultar la resenia mientras se revisa, "solo
// si alega datos personales o agresion"), asi que el valor tiene que ser un
// slug estable que el codigo pueda comparar, no texto libre que puede
// cambiar de redaccion.
export const MOTIVOS_DENUNCIA_RESENIA = [
  { clave: "datos_personales", etiqueta: "Expone datos personales", oculta: true },
  { clave: "agresion", etiqueta: "Agresión o lenguaje ofensivo", oculta: true },
  { clave: "contenido_falso", etiqueta: "La reseña no corresponde o es falsa", oculta: false },
  { clave: "otro", etiqueta: "Otro motivo", oculta: false },
] as const;

export const MOTIVOS_DENUNCIA_RESENIA_QUE_OCULTAN = MOTIVOS_DENUNCIA_RESENIA.filter(
  (motivo) => motivo.oculta,
).map((motivo) => motivo.clave);

export type ClaveMotivoDenunciaResenia = (typeof MOTIVOS_DENUNCIA_RESENIA)[number]["clave"];

// AD-02, cola de denuncias no-pedido (D14): sin motivo tipificado (a
// diferencia de MotivoBloqueoPedido) porque "resolver" acá nunca aplica una
// sancion automatica sobre el objeto denunciado, salvo el caso especial de
// resenia (ocultar definitivamente, ver denunciaModeracionVistaSchema).
export const resolverDenunciaModeracionSchema = z.object({
  accion: z.enum(["descartar", "resolver"]),
});
export type ResolverDenunciaModeracion = z.infer<typeof resolverDenunciaModeracionSchema>;

// AD-02: query de paginacion por cursor de la cola de perfil/postulacion/resenia.
export const denunciaModeracionColaQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
});
export type DenunciaModeracionColaQuery = z.infer<typeof denunciaModeracionColaQuerySchema>;

// D14: vista generica para perfil/postulacion/resenia en la cola de AD-02.
// `resumen` es texto ya armado por el backend (distinto segun tipoObjeto, ver
// service) para que el front no tenga que conocer la forma de cada tipo de
// objeto. `usuarioId` es a quien apunta la denuncia (dueno del perfil,
// profesional de la postulacion, o **cliente que escribio la resenia**, no el
// profesional reseñado: una denuncia de resenia es sobre la conducta de quien
// la escribio) para que AD-02 pueda enlazar a AD-03 (docs/dominio.md D14:
// "la cola enlaza al usuario en AD-03").
export const denunciaModeracionVistaSchema = z.object({
  id: z.string().uuid(),
  tipoObjeto: tipoObjetoDenunciaSchema,
  motivo: z.string(),
  detalle: z.string().nullable(),
  creadoEn: z.string(),
  reportante: z.object({ nombre: z.string().nullable(), apellido: z.string().nullable() }),
  resumen: z.string(),
  usuarioId: z.string().uuid().nullable(),
});
export type DenunciaModeracionVista = z.infer<typeof denunciaModeracionVistaSchema>;

export const denunciaModeracionPaginaSchema = z.object({
  items: z.array(denunciaModeracionVistaSchema),
  cursor: z.string().uuid().nullable(),
});
export type DenunciaModeracionPagina = z.infer<typeof denunciaModeracionPaginaSchema>;
