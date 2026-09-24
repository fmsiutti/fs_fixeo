import { z } from "zod";
import { estadoPedidoSchema, estadoPostulacionSchema } from "./estados.js";

// docs/dominio.md §5 no fija limites de largo para mensaje/disponibilidad de
// postulacion (a diferencia de descripcion_min/max de pedido, que si son
// parametro de negocio). Estos son topes de seguridad del contrato, no de
// negocio real: evitan un payload absurdo antes de llegar al service.
export const MENSAJE_POSTULACION_MIN = 10;
const MENSAJE_POSTULACION_MAX_SEGURIDAD = 2000;
const DISPONIBILIDAD_MAX_SEGURIDAD = 300;
// Pesos enteros (CLAUDE.md raiz: "Dinero: pesos enteros, nunca float"). Tope
// de seguridad, no un limite de negocio real.
const ESTIMACION_MAX_SEGURIDAD = 100_000_000;

// PR-04: "estimacion (rango o «a definir en la visita»)".
export const estimacionPostulacionSchema = z
  .discriminatedUnion("aDefinir", [
    z.object({ aDefinir: z.literal(true) }),
    z.object({
      aDefinir: z.literal(false),
      minimo: z.number().int().min(0).max(ESTIMACION_MAX_SEGURIDAD),
      maximo: z.number().int().min(0).max(ESTIMACION_MAX_SEGURIDAD),
    }),
  ])
  .refine(
    (valor) => {
      if (valor.aDefinir) return true;
      return valor.minimo <= valor.maximo;
    },
    { message: "El minimo no puede ser mayor al maximo", path: ["maximo"] },
  );

export type EstimacionPostulacionInput = z.infer<typeof estimacionPostulacionSchema>;

// PR-04: "Mensaje con plantillas, estimacion..., disponibilidad". La deteccion
// de datos de contacto (regla no negociable #6) se aplica en el backend sobre
// `mensaje` y `disponibilidad` juntos, mismo criterio que ya usa
// PedidosService con descripcion/subcategoria/respuestasGuia.
export const crearPostulacionSchema = z.object({
  pedidoId: z.string().uuid(),
  mensaje: z
    .string()
    .trim()
    .min(MENSAJE_POSTULACION_MIN, "Contale un poco mas al cliente")
    .max(MENSAJE_POSTULACION_MAX_SEGURIDAD),
  estimacion: estimacionPostulacionSchema,
  disponibilidad: z.string().trim().min(1).max(DISPONIBILIDAD_MAX_SEGURIDAD).optional(),
});

export type CrearPostulacion = z.infer<typeof crearPostulacionSchema>;

// --- Plantillas de mensaje (PR-04/PR-07, docs/dominio.md §11 "plantilla_mensaje") ---

export const PLANTILLA_MENSAJE_MAX = 500;
// Tope de seguridad (no parametro de negocio): evita que un perfil acumule
// plantillas sin limite.
export const PLANTILLAS_MENSAJE_MAX_POR_PERFIL = 20;

export const crearPlantillaMensajeSchema = z.object({
  texto: z.string().trim().min(1).max(PLANTILLA_MENSAJE_MAX),
});

export type CrearPlantillaMensaje = z.infer<typeof crearPlantillaMensajeSchema>;

export const plantillaMensajeVistaSchema = z.object({
  id: z.string().uuid(),
  texto: z.string(),
  creadoEn: z.string(),
});

export type PlantillaMensajeVista = z.infer<typeof plantillaMensajeVistaSchema>;

// --- Vistas ---

// PR-05: vista del profesional sobre su propia postulacion. Nunca incluye
// datos del cliente mas alla de lo que ya expone PedidoFeedItemVista/
// PedidoVistaProfesional (docs/dominio.md §7: antes de la seleccion, el
// cliente es practicamente anonimo para el profesional).
export const postulacionVistaProfesionalSchema = z.object({
  id: z.string().uuid(),
  pedido: z.object({
    id: z.string().uuid(),
    categoria: z.object({ nombre: z.string(), slug: z.string() }),
    descripcion: z.string(),
    estado: estadoPedidoSchema,
  }),
  mensaje: z.string(),
  estimacion: estimacionPostulacionSchema,
  disponibilidad: z.string().nullable(),
  estado: estadoPostulacionSchema,
  // D2 (docs/dominio.md §4/§12): el cliente ya eligio a otro profesional pero
  // esta postulacion sigue viva mientras quede cupo de elegibles.
  otroYaElegido: z.boolean(),
  enviadaEn: z.string(),
  vistaEn: z.string().nullable(),
});

export type PostulacionVistaProfesional = z.infer<typeof postulacionVistaProfesionalSchema>;

// CL-08: vista del cliente sobre las postulaciones de su propio pedido. El
// profesional siempre se ve completo (nombre, apellido, perfil) salvo el
// telefono, que solo se revela al elegido (docs/dominio.md §7) — ese dato ni
// siquiera esta en este schema, se agrega recien en el slice de contacto.
export const postulacionVistaClienteSchema = z.object({
  id: z.string().uuid(),
  profesional: z.object({
    id: z.string().uuid(),
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
    fotoUrl: z.string().nullable(),
    promedioResenias: z.number().nullable(),
    cantidadResenias: z.number(),
    aniosExperiencia: z.number().nullable(),
  }),
  mensaje: z.string(),
  estimacion: estimacionPostulacionSchema,
  disponibilidad: z.string().nullable(),
  estado: estadoPostulacionSchema,
  // PR-08: "Descartar reversible 24 h" — el backend calcula estas dos banderas
  // (no el front) para no duplicar la regla de la ventana horaria.
  puedeDescartar: z.boolean(),
  puedeRevertirDescarte: z.boolean(),
  enviadaEn: z.string(),
});

export type PostulacionVistaCliente = z.infer<typeof postulacionVistaClienteSchema>;

// PR-04: "contador diario". `renuevaEn` es la proxima medianoche en
// America/Argentina/Buenos_Aires (D7), en UTC/ISO para que el front la
// formatee.
export const contadorDiarioPostulacionesSchema = z.object({
  usadas: z.number(),
  maximo: z.number(),
  renuevaEn: z.string(),
});

export type ContadorDiarioPostulaciones = z.infer<typeof contadorDiarioPostulacionesSchema>;

// PR-05: "Pestañas enviadas, seleccionadas, cerradas".
export const GRUPOS_ESTADO_POSTULACION = ["enviadas", "seleccionadas", "cerradas"] as const;

export const grupoEstadoPostulacionSchema = z.enum(GRUPOS_ESTADO_POSTULACION);

export type GrupoEstadoPostulacion = z.infer<typeof grupoEstadoPostulacionSchema>;

export const listarPostulacionesQuerySchema = z.object({
  grupo: grupoEstadoPostulacionSchema.default("enviadas"),
  cursor: z.string().uuid().optional(),
});

export type ListarPostulacionesQuery = z.infer<typeof listarPostulacionesQuerySchema>;

export const postulacionesPaginaSchema = z.object({
  items: z.array(postulacionVistaProfesionalSchema),
  cursor: z.string().uuid().nullable(),
});

export type PostulacionesPagina = z.infer<typeof postulacionesPaginaSchema>;
