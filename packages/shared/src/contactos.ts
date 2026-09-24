import { z } from "zod";
import { estadoPostulacionSchema, franjaSchema, urgenciaSchema } from "./estados.js";
import { estimacionPostulacionSchema } from "./postulaciones.js";

// CL-10: un bloque por profesional elegido. `estadoPostulacion` viaja completo
// (no solo un booleano) para que el front pueda distinguir "retirada" ("no
// puede tomar tu pedido", PR-06) de "seleccionada" sin agregar otro campo.
export const contactoVistaClienteSchema = z.object({
  id: z.string().uuid(),
  // El front la necesita para registrar los eventos `whatsapp_abierto` /
  // `llamada_iniciada` (POST /postulaciones/:id/evento-contacto), que cuelga
  // de la Postulacion, no del Contacto.
  postulacionId: z.string().uuid(),
  orden: z.number(),
  profesional: z.object({
    id: z.string().uuid(),
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
    fotoUrl: z.string().nullable(),
    // docs/dominio.md §7: el telefono del profesional solo se revela al
    // cliente que lo elige. Este schema no existe hasta la seleccion.
    telefono: z.string(),
    promedioResenias: z.number().nullable(),
    cantidadResenias: z.number(),
    aniosExperiencia: z.number().nullable(),
  }),
  mensaje: z.string(),
  estimacion: estimacionPostulacionSchema,
  estadoPostulacion: estadoPostulacionSchema,
  habilitadoEn: z.string(),
});

export type ContactoVistaCliente = z.infer<typeof contactoVistaClienteSchema>;

// PR-06: lo que ve el profesional elegido sobre el pedido y el cliente.
// Telefono, apellido y direccion exacta solo existen en este schema (nunca en
// PedidoVistaProfesional/PostulacionVistaProfesional, que son de antes de la
// seleccion).
export const contactoVistaProfesionalSchema = z.object({
  id: z.string().uuid(),
  pedido: z.object({
    id: z.string().uuid(),
    categoria: z.object({ nombre: z.string(), slug: z.string() }),
    descripcion: z.string(),
    urgencia: urgenciaSchema,
    franjas: z.array(franjaSchema),
  }),
  cliente: z.object({
    nombre: z.string().nullable(),
    apellido: z.string().nullable(),
    telefono: z.string(),
    direccion: z.object({
      calle: z.string(),
      numero: z.string(),
      piso: z.string().nullable(),
      depto: z.string().nullable(),
      lat: z.number(),
      lng: z.number(),
    }),
    barrio: z.object({ nombre: z.string() }),
  }),
  // docs/dominio.md §4 (D2): elegir a un segundo no le revela nada al
  // primero ni al reves; esto solo le dice al profesional que sigue habiendo
  // otros elegidos, sin identificarlos.
  hayOtrosElegidos: z.boolean(),
  estadoPostulacion: estadoPostulacionSchema,
  habilitadoEn: z.string(),
});

export type ContactoVistaProfesional = z.infer<typeof contactoVistaProfesionalSchema>;

// PR-06/CL-10: registra que alguna de las dos partes abrio WhatsApp o inicio
// una llamada desde la pantalla de contacto. Vive aca (no en eventos.ts)
// porque es una accion sobre un Contacto puntual, con la misma forma que las
// dos vistas de este archivo; eventos.ts queda para los payloads que dispara
// el cliente sin sesion o que resuelven categoria/zona desde otro lado.
export const registrarEventoContactoSchema = z.object({
  tipo: z.enum(["whatsapp_abierto", "llamada_iniciada"]),
});

export type RegistrarEventoContacto = z.infer<typeof registrarEventoContactoSchema>;
