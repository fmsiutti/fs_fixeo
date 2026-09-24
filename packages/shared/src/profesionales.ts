import { z } from "zod";
import {
  estadoMatriculaSchema,
  estadoVerificacionSchema,
  tipoVerificacionSchema,
} from "./estados.js";

// PR-01 (paso "datos basicos"): lo minimo para armar el perfil, todo
// opcional porque se guarda incremental a medida que el profesional avanza
// por la barra de progreso.
export const armarPerfilSchema = z.object({
  presentacion: z.string().trim().min(1).max(500).optional(),
  aniosExperiencia: z.number().int().min(0).optional(),
});

export type ArmarPerfil = z.infer<typeof armarPerfilSchema>;

// PR-01 (paso "oficios"): sin id propio en el input porque no hay edicion
// incremental en este slice (docs/dominio.md, ver profesionales.service.ts
// guardarOficios): el service reemplaza el set completo contra
// oficio_profesional.categoria_id (unique por perfil).
export const oficioInputSchema = z.object({
  categoriaId: z.string().uuid(),
  subcategorias: z.array(z.string().trim().min(1)).default([]),
});

export type OficioInput = z.infer<typeof oficioInputSchema>;

export const guardarOficiosSchema = z.object({
  oficios: z
    .array(oficioInputSchema)
    .max(8, "Solo hay 8 categorias en el piloto")
    .refine(
      (oficios) => new Set(oficios.map((oficio) => oficio.categoriaId)).size === oficios.length,
      "No repitas la misma categoria",
    ),
});

export type GuardarOficios = z.infer<typeof guardarOficiosSchema>;

// PR-01 (paso "zona"): discriminada por tipo, igual que zona_cobertura en la
// base (columnas de radio nulas si es por barrios y viceversa).
const zonaCoberturaBarriosSchema = z.object({
  tipo: z.literal("barrios"),
  barrioIds: z.array(z.string().uuid()).min(1, "Elegi al menos un barrio"),
});

const zonaCoberturaRadioSchema = z.object({
  tipo: z.literal("radio"),
  centroLat: z.number(),
  centroLng: z.number(),
  radioKm: z.number().positive(),
});

export const zonaCoberturaSchema = z.discriminatedUnion("tipo", [
  zonaCoberturaBarriosSchema,
  zonaCoberturaRadioSchema,
]);

export type ZonaCoberturaInput = z.infer<typeof zonaCoberturaSchema>;

// AD-01: motivos tipificados de rechazo, para que el aviso al profesional
// diga que tiene que recargar (docs/pantallas.md AD-01).
export const MOTIVOS_RECHAZO_VERIFICACION = [
  "foto_ilegible",
  "documento_vencido",
  "datos_no_coinciden",
  "matricula_no_valida",
  "otro",
] as const;

export const motivoRechazoVerificacionSchema = z.enum(MOTIVOS_RECHAZO_VERIFICACION);

export type MotivoRechazoVerificacion = z.infer<typeof motivoRechazoVerificacionSchema>;

// Metadata que acompania al archivo multipart de POST /verificaciones/documentos
// (analogo a borradorIdSchema de pedidos). Para tipo=matricula, D9
// (docs/dominio.md §12) pide numero, ente y vencimiento a mano.
export const subirDocumentoVerificacionSchema = z
  .object({
    tipo: tipoVerificacionSchema,
    oficioId: z.string().uuid().optional(),
    matriculaNumero: z.string().trim().min(1).max(60).optional(),
    matriculaEnte: z.string().trim().min(1).max(120).optional(),
    matriculaVenceEn: z.coerce.date().optional(),
  })
  .refine((datos) => datos.tipo !== "matricula" || Boolean(datos.oficioId), {
    message: "Falta indicar el oficio de la matricula",
    path: ["oficioId"],
  })
  .refine((datos) => datos.tipo !== "matricula" || Boolean(datos.matriculaNumero), {
    message: "Falta el numero de matricula",
    path: ["matriculaNumero"],
  })
  .refine((datos) => datos.tipo !== "matricula" || Boolean(datos.matriculaEnte), {
    message: "Falta el ente que emitio la matricula",
    path: ["matriculaEnte"],
  })
  .refine((datos) => datos.tipo !== "matricula" || Boolean(datos.matriculaVenceEn), {
    message: "Falta la fecha de vencimiento de la matricula",
    path: ["matriculaVenceEn"],
  });

export type SubirDocumentoVerificacion = z.infer<typeof subirDocumentoVerificacionSchema>;

// AD-01: resolver una verificacion. El motivo tipificado es obligatorio solo
// al rechazar; `detalle` es texto libre adicional, opcional siempre.
export const resolverVerificacionSchema = z
  .object({
    accion: z.enum(["aprobar", "rechazar"]),
    motivo: motivoRechazoVerificacionSchema.optional(),
    detalle: z.string().trim().min(1).max(500).optional(),
  })
  .refine((datos) => datos.accion !== "rechazar" || Boolean(datos.motivo), {
    message: "El motivo es obligatorio para rechazar",
    path: ["motivo"],
  });

export type ResolverVerificacion = z.infer<typeof resolverVerificacionSchema>;

// --- Vistas ---

export const oficioVistaSchema = z.object({
  id: z.string().uuid(),
  categoria: z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    slug: z.string(),
  }),
  subcategorias: z.array(z.string()),
  matriculaNumero: z.string().nullable(),
  matriculaEnte: z.string().nullable(),
  matriculaEstado: estadoMatriculaSchema,
  matriculaVenceEn: z.string().nullable(),
});

export type OficioVista = z.infer<typeof oficioVistaSchema>;

export const zonaCoberturaVistaSchema = z
  .discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("barrios"), barrioIds: z.array(z.string().uuid()) }),
    z.object({
      tipo: z.literal("radio"),
      centroLat: z.number(),
      centroLng: z.number(),
      radioKm: z.number(),
    }),
  ])
  .nullable();

export type ZonaCoberturaVista = z.infer<typeof zonaCoberturaVistaSchema>;

// CL-09 (revision de codigo del slice 6): version publica de la zona, sin
// `centroLat`/`centroLng`. Esas coordenadas son el punto de referencia real
// del profesional (en la practica, su casa o taller) — exponerlas a
// cualquier usuario autenticado que abre un perfil publico es un dato
// personal de mas (docs/dominio.md §15), y la pantalla nunca necesito mas que
// el radio en km. `zonaCoberturaVistaSchema` (con coordenadas) sigue
// reservado para la vista propia del dueno del perfil (PR-07).
export const zonaCoberturaVistaPublicaSchema = z
  .discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("barrios"), barrioIds: z.array(z.string().uuid()) }),
    z.object({ tipo: z.literal("radio"), radioKm: z.number() }),
  ])
  .nullable();

export type ZonaCoberturaVistaPublica = z.infer<typeof zonaCoberturaVistaPublicaSchema>;

// Resumen de una verificacion propia (PR-07/PR-01): a diferencia de
// verificacionColaVistaSchema (solo moderador/soporte), este es lo minimo
// que necesita el dueno del perfil para saber por que se rechazo algo.
export const verificacionResumenVistaSchema = z.object({
  id: z.string().uuid(),
  tipo: tipoVerificacionSchema,
  // Null cuando tipo="identidad" (no tiene oficio asociado). Permite al
  // frontend atribuir una matricula rechazada al OficioProfesional correcto
  // cuando hay 2+ oficios con matricula rechazada a la vez.
  oficioId: z.string().uuid().nullable(),
  estado: estadoVerificacionSchema,
  motivoRechazo: z.string().nullable(),
  revisadaEn: z.string().nullable(),
});

export type VerificacionResumenVista = z.infer<typeof verificacionResumenVistaSchema>;

// Vista completa para el dueno del perfil (PR-07): incluye el estado de cada
// verificacion en curso (y su motivo de rechazo si aplica), algo que la
// vista publica nunca expone.
export const perfilProfesionalVistaPropiaSchema = z.object({
  id: z.string().uuid(),
  presentacion: z.string().nullable(),
  aniosExperiencia: z.number().nullable(),
  estadoVerificacion: estadoVerificacionSchema,
  verificadoEn: z.string().nullable(),
  pausado: z.boolean(),
  tasaRespuesta: z.number().nullable(),
  promedioResenias: z.number().nullable(),
  cantidadResenias: z.number(),
  trabajosCerrados: z.number(),
  oficios: z.array(oficioVistaSchema),
  zonaCobertura: zonaCoberturaVistaSchema,
  verificaciones: z.array(verificacionResumenVistaSchema),
  creadoEn: z.string(),
});

export type PerfilProfesionalVistaPropia = z.infer<typeof perfilProfesionalVistaPropiaSchema>;

// Vista de una Verificacion resuelta (respuesta de POST documentos / PATCH resolver).
export const verificacionVistaSchema = z.object({
  id: z.string().uuid(),
  tipo: tipoVerificacionSchema,
  estado: estadoVerificacionSchema,
  motivoRechazo: z.string().nullable(),
  enviadaEn: z.string(),
  revisadaEn: z.string().nullable(),
});

export type VerificacionVista = z.infer<typeof verificacionVistaSchema>;

// AD-01: cola de verificaciones pendientes. `documentos` ya son URLs
// firmadas, nunca la key cruda de storage (CLAUDE.md, "nunca devolver
// entidad Prisma cruda").
export const verificacionColaVistaSchema = z.object({
  id: z.string().uuid(),
  tipo: tipoVerificacionSchema,
  enviadaEn: z.string(),
  documentos: z.array(z.string()),
  perfil: z.object({
    id: z.string().uuid(),
    usuarioId: z.string().uuid(),
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
  }),
  oficio: z
    .object({
      categoria: z.object({ id: z.string().uuid(), nombre: z.string(), slug: z.string() }),
      matriculaNumero: z.string().nullable(),
      matriculaEnte: z.string().nullable(),
      matriculaVenceEn: z.string().nullable(),
    })
    .nullable(),
});

export type VerificacionColaVista = z.infer<typeof verificacionColaVistaSchema>;

export const verificacionColaPaginaSchema = z.object({
  items: z.array(verificacionColaVistaSchema),
  cursor: z.string().uuid().nullable(),
});

export type VerificacionColaPagina = z.infer<typeof verificacionColaPaginaSchema>;

// AD-01: query de paginacion por cursor de la cola de verificaciones.
export const verificacionColaQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
});

export type VerificacionColaQuery = z.infer<typeof verificacionColaQuerySchema>;

// CL-09 · Perfil del profesional, vista publica (para el cliente que evalua
// postulaciones). Nombre y apellido siempre completos (docs/dominio.md §7:
// "Nombre y perfil del profesional | Completo | Completo") — el telefono NO
// esta en este schema, ese es el unico dato que sigue oculto antes de elegir.
// Sin galeria ni distribucion de resenias por puntaje: no hay tabla modelada
// para fotos de trabajos, y Resenia recien se modela en el slice 8 (por ahora
// promedioResenias/cantidadResenias siempre reflejan "Nuevo en Fixeo").
export const perfilProfesionalVistaPublicaSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().nullable(),
  apellido: z.string().nullable(),
  fotoUrl: z.string().nullable(),
  presentacion: z.string().nullable(),
  aniosExperiencia: z.number().nullable(),
  estadoVerificacion: estadoVerificacionSchema,
  promedioResenias: z.number().nullable(),
  cantidadResenias: z.number(),
  trabajosCerrados: z.number(),
  oficios: z.array(
    z.object({
      categoria: z.object({ nombre: z.string(), slug: z.string() }),
      subcategorias: z.array(z.string()),
      matriculaEstado: estadoMatriculaSchema,
    }),
  ),
  zonaCobertura: zonaCoberturaVistaPublicaSchema,
});

export type PerfilProfesionalVistaPublica = z.infer<typeof perfilProfesionalVistaPublicaSchema>;
