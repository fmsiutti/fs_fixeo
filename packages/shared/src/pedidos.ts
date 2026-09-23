import { z } from "zod";
import {
  estadoPedidoSchema,
  franjaSchema,
  tipoPropiedadSchema,
  urgenciaSchema,
} from "./estados.js";

// Limites basicos para UX del front (feedback inmediato en el formulario,
// coinciden con los valores sembrados de descripcion_min/max y fotos_max).
// La validacion autoritativa vive en ParametrosService del backend
// (docs/dominio.md §5): estos NO se usan como limite del schema de abajo,
// porque el ZodValidationPipe corre antes que el service y un limite fijo
// aca taparia cualquier cambio futuro del parametro de negocio (solo podria
// endurecerlo, nunca aflojarlo). El schema usa en cambio los topes de
// seguridad de mas abajo.
export const DESCRIPCION_MIN = 20;
export const DESCRIPCION_MAX = 1000;
export const FOTOS_MAX = 6;

// Topes de seguridad del contrato (no de negocio): solo evitan un payload
// absurdo antes de llegar al service. El limite real de negocio lo valida
// PedidosService contra ParametrosService.
const DESCRIPCION_MAX_SEGURIDAD = 5000;
const FOTOS_MAX_SEGURIDAD = 20;

export const direccionSchema = z.object({
  calle: z.string().trim().min(1, "Falta la calle"),
  numero: z.string().trim().min(1, "Falta la altura"),
  piso: z.string().trim().min(1).optional(),
  depto: z.string().trim().min(1).optional(),
  tipoPropiedad: tipoPropiedadSchema,
  barrioId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
});

export type DireccionInput = z.infer<typeof direccionSchema>;

// Mapa pregunta (texto exacto de categoria.preguntasGuia) -> respuesta. Sin
// id propio porque las preguntas tampoco lo tienen (son solo texto en el
// catalogo); el service valida que las claves sean preguntas reales de la
// categoria elegida.
export const respuestasGuiaSchema = z
  .record(z.string(), z.string().trim().min(1).max(500))
  .optional();

export type RespuestasGuia = z.infer<typeof respuestasGuiaSchema>;

// A proposito solo el id: la url de una foto de pedido nunca la manda el
// cliente (si lo hiciera, se podria colar una url arbitraria como "foto" de
// un pedido, o una foto subida por otro borradorId). El backend recalcula la
// url el mismo a partir de `borradorId` + este id, y confirma contra el
// storage que el archivo realmente existe antes de asociarlo.
export const fotoPedidoInputSchema = z.object({
  id: z.string().uuid(),
});

export type FotoPedidoInput = z.infer<typeof fotoPedidoInputSchema>;

export const crearPedidoSchema = z.object({
  categoriaId: z.string().uuid(),
  subcategoria: z.string().trim().min(1).optional(),
  descripcion: z.string().trim().min(1, "Falta la descripcion").max(DESCRIPCION_MAX_SEGURIDAD),
  respuestasGuia: respuestasGuiaSchema,
  urgencia: urgenciaSchema,
  franjas: z.array(franjaSchema).min(1, "Elegi al menos una franja horaria"),
  direccion: direccionSchema,
  borradorId: z.string().uuid(),
  fotos: z
    .array(fotoPedidoInputSchema)
    .max(FOTOS_MAX_SEGURIDAD)
    .refine(
      (fotos) => new Set(fotos.map((foto) => foto.id)).size === fotos.length,
      "No repitas la misma foto",
    )
    .default([]),
});

export type CrearPedido = z.infer<typeof crearPedidoSchema>;

// docs/dominio.md §3: "el pedido solo se edita hasta la primera
// postulacion". A proposito no incluye direccion ni fotos: cambiarlas
// implicaria repetir la geolocalizacion y la verificacion de storage del
// asistente completo, que excede lo que este slice necesita para CL-07.
export const editarPedidoSchema = z.object({
  subcategoria: z.string().trim().min(1).optional(),
  descripcion: z.string().trim().min(1, "Falta la descripcion").max(DESCRIPCION_MAX_SEGURIDAD),
  respuestasGuia: respuestasGuiaSchema,
  urgencia: urgenciaSchema,
  franjas: z.array(franjaSchema).min(1, "Elegi al menos una franja horaria"),
});

export type EditarPedido = z.infer<typeof editarPedidoSchema>;

// Un solo schema para los dos endpoints de fotos del asistente (CL-03): tanto
// subir como borrar solo necesitan el borradorId que genera el cliente, sin
// autenticacion (suben antes de que exista pedido o cuenta).
export const borradorIdSchema = z.object({
  borradorId: z.string().uuid(),
});

export type BorradorIdInput = z.infer<typeof borradorIdSchema>;

// Vista completa para el dueno del pedido (CL-07). Todavia no hay otro rol
// que necesite ver un Pedido (el feed del profesional es el slice 5), asi
// que no se construye una segunda vista "publica" de mas.
export const pedidoVistaSchema = z.object({
  id: z.string().uuid(),
  categoria: z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    slug: z.string(),
  }),
  subcategoria: z.string().nullable(),
  descripcion: z.string(),
  respuestasGuia: z.record(z.string(), z.string()).nullable(),
  urgencia: urgenciaSchema,
  franjas: z.array(franjaSchema),
  direccion: z.object({
    calle: z.string(),
    numero: z.string(),
    piso: z.string().nullable(),
    depto: z.string().nullable(),
    tipoPropiedad: tipoPropiedadSchema,
    lat: z.number(),
    lng: z.number(),
  }),
  barrio: z.object({
    id: z.string().uuid(),
    nombre: z.string(),
  }),
  estado: estadoPedidoSchema,
  publicadoEn: z.string().nullable(),
  expiraEn: z.string().nullable(),
  fotos: z.array(
    z.object({
      id: z.string().uuid(),
      url: z.string(),
      orden: z.number(),
    }),
  ),
  vistas: z.number(),
  cantidadPostulaciones: z.number(),
  creadoEn: z.string(),
});

export type PedidoVista = z.infer<typeof pedidoVistaSchema>;

// Version liviana para la lista de pedidos propios (CL-01).
export const pedidoResumenVistaSchema = z.object({
  id: z.string().uuid(),
  categoria: z.object({
    nombre: z.string(),
    slug: z.string(),
  }),
  descripcion: z.string(),
  estado: estadoPedidoSchema,
  urgencia: urgenciaSchema,
  creadoEn: z.string(),
});

export type PedidoResumenVista = z.infer<typeof pedidoResumenVistaSchema>;

// --- Feed y detalle para el profesional (PR-02, PR-03, docs/dominio.md §6) ---

// Filtros de PR-02: "oficio, distancia, urgencia, con fotos, sin
// postulaciones". `categoriaId` sirve para acotar a un oficio puntual cuando
// el profesional tiene varios; sin filtro, el feed ya viene acotado a sus
// oficios y su zona. `distanciaMaxKm` solo tiene efecto sobre coincidencias
// por zona tipo "radio": una zona tipo "barrios" no tiene una distancia
// numerica que comparar (ver distanciaKm mas abajo).
// OJO: `z.coerce.boolean()` convierte CUALQUIER string no vacio (incluido
// "false") en `true` (revision de codigo del slice 5): un query string
// siempre manda strings, asi que ese schema nunca podia expresar "false" de
// verdad. Se valida el string exacto y se transforma a mano.
const booleanoDeQuerySchema = z
  .enum(["true", "false"])
  .transform((valor) => valor === "true")
  .optional();

export const pedidoFeedFiltrosSchema = z.object({
  categoriaId: z.string().uuid().optional(),
  urgencia: urgenciaSchema.optional(),
  conFotos: booleanoDeQuerySchema,
  sinPostulaciones: booleanoDeQuerySchema,
  distanciaMaxKm: z.coerce.number().positive().optional(),
  cursor: z.string().uuid().optional(),
});

export type PedidoFeedFiltros = z.infer<typeof pedidoFeedFiltrosSchema>;

// Tarjeta de PR-02: "barrio, distancia, urgencia, antigüedad, postulados".
// Sin datos del cliente (ni siquiera el nombre de pila: eso es PR-03).
export const pedidoFeedItemVistaSchema = z.object({
  id: z.string().uuid(),
  categoria: z.object({
    nombre: z.string(),
    slug: z.string(),
  }),
  urgencia: urgenciaSchema,
  barrio: z.object({
    id: z.string().uuid(),
    nombre: z.string(),
  }),
  // Null cuando la zona del profesional que pide el feed es tipo "barrios"
  // (no hay coordenada de barrio en el catalogo para medir distancia real).
  distanciaKm: z.number().nullable(),
  cantidadPostulaciones: z.number(),
  tieneFotos: z.boolean(),
  // D2/D3 (docs/dominio.md §12): el pedido sigue en el feed marcado asi
  // mientras quede cupo de elegibles.
  yaEligioAlguien: z.boolean(),
  publicadoEn: z.string().nullable(),
  creadoEn: z.string(),
});

export type PedidoFeedItemVista = z.infer<typeof pedidoFeedItemVistaSchema>;

// `verificacionAprobada` es el dato para el banner de PR-02 ("Verificación
// pendiente: feed visible, postulaciones bloqueadas"): el profesional ve el
// feed igual, pero el front usa este flag para avisarle que todavia no puede
// postularse (docs/dominio.md §6).
export const pedidoFeedPaginaSchema = z.object({
  items: z.array(pedidoFeedItemVistaSchema),
  cursor: z.string().uuid().nullable(),
  verificacionAprobada: z.boolean(),
});

export type PedidoFeedPagina = z.infer<typeof pedidoFeedPaginaSchema>;

// Detalle de PR-03 para el profesional. A diferencia de PedidoVista (dueno
// del pedido), nunca incluye telefono, apellido ni direccion exacta del
// cliente (docs/dominio.md §7: eso es solo para el elegido, en el slice de
// contacto). Cuando el pedido ya completo sus 3 elegidos, el backend no
// devuelve esta vista: tira un conflicto especifico para que el front
// muestre "el cliente ya completó su elección" y vuelva al feed (ficha
// PR-03).
export const pedidoVistaProfesionalSchema = z.object({
  id: z.string().uuid(),
  categoria: z.object({
    id: z.string().uuid(),
    nombre: z.string(),
    slug: z.string(),
  }),
  subcategoria: z.string().nullable(),
  descripcion: z.string(),
  respuestasGuia: z.record(z.string(), z.string()).nullable(),
  urgencia: urgenciaSchema,
  franjas: z.array(franjaSchema),
  barrio: z.object({
    id: z.string().uuid(),
    nombre: z.string(),
  }),
  distanciaKm: z.number().nullable(),
  fotos: z.array(
    z.object({
      id: z.string().uuid(),
      url: z.string(),
      orden: z.number(),
    }),
  ),
  estado: estadoPedidoSchema,
  // Nombre de pila del cliente, la unica identidad que se ve antes de la
  // seleccion (docs/dominio.md §7).
  cliente: z.object({
    nombre: z.string().nullable(),
  }),
  cantidadPostulaciones: z.number(),
  // PR-03: "Cupo de postulaciones lleno: boton deshabilitado con el motivo".
  postulacionesCupoLleno: z.boolean(),
  // D2/D3: sigue vivo mientras seleccionablesLibres > 0.
  yaEligioAlguien: z.boolean(),
  seleccionablesLibres: z.number(),
  // docs/dominio.md §6: "un profesional sin verificacion aprobada ve el feed
  // pero no puede postularse". PR-02 ya lo banner-ea a nivel pagina; PR-03
  // necesita el mismo dato para deshabilitar "Postularme" con el motivo
  // (revision de codigo del slice 5: antes solo se chequeaba el cupo).
  verificacionAprobada: z.boolean(),
  publicadoEn: z.string().nullable(),
  creadoEn: z.string(),
});

export type PedidoVistaProfesional = z.infer<typeof pedidoVistaProfesionalSchema>;
