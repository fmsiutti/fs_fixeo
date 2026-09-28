import { z } from "zod";

// CO-05: "lista unificada en la app, toda notificacion se persiste en
// `notificacion`" (docs/dominio.md §9). El texto y la ruta de cada tipo se
// resuelven aca, del lado del backend, para que el front no tenga que
// conocer el significado de cada `tipo` (el mapa completo vive en un solo
// lugar). `ruta` es una funcion pura (sin acceso a datos extra): recibe el
// `objetoId` guardado con la notificacion y arma la URL del front a la que
// navega CO-05 al tocarla. Nunca devuelve undefined, incluso con
// `objetoId: null` (un tipo que no lo necesita, o que perdio el dato).
export interface TextoNotificacion {
  titulo: string;
  cuerpo: string;
  ruta: (objetoId: string | null) => string;
}

// Lista exhaustiva de los `tipo` que hoy emite el backend (verificado con
// grep sobre cada call site real de `notificaciones.crear`/`crearVarias`,
// apps/api/src). Si se agrega un tipo nuevo en el futuro y se olvida acá, el
// fallback de `NotificacionesService` evita que rompa: solo pierde el texto
// especifico.
export const TEXTOS_NOTIFICACION: Record<string, TextoNotificacion> = {
  // Profesional: docs/dominio.md §6/§9, aviso inicial de matching.
  pedido_nuevo_coincide: {
    titulo: "Nuevo pedido cerca tuyo",
    cuerpo: "Hay un pedido que puede interesarte. Mirá si te conviene postularte.",
    ruta: (id) => (id ? `/trabajos/${id}` : "/trabajos"),
  },
  // Cliente: aviso a los 6 dias de vigencia.
  pedido_por_expirar: {
    titulo: "Tu pedido está por vencer",
    cuerpo: "Quedan pocos días de publicación. Revisalo antes de que expire.",
    ruta: (id) => (id ? `/pedidos/${id}` : "/"),
  },
  // Cliente: 12 h sin postulaciones.
  pedido_sin_postulaciones: {
    titulo: "Todavía sin postulaciones",
    cuerpo: "Tu pedido lleva un tiempo sin postulaciones. Te dejamos algunas sugerencias.",
    ruta: (id) => (id ? `/pedidos/${id}` : "/"),
  },
  // Cliente: consulta a las 48 h del contacto habilitado. objetoId es el
  // Contacto (no el pedido): sin un pedidoId a mano, se enlaza al inicio.
  consulta_contacto: {
    titulo: "¿Cómo va tu pedido?",
    cuerpo: "Queremos saber si ya te contactaste con el profesional elegido.",
    ruta: () => "/",
  },
  // Cliente: consulta de desenlace (dia 7).
  consulta_desenlace: {
    titulo: "¿Cómo terminó tu pedido?",
    cuerpo: "Contanos qué pasó para cerrar tu pedido.",
    ruta: (id) => (id ? `/pedidos/${id}/cerrar` : "/"),
  },
  // Cliente: unica repregunta tras postergar (D4).
  consulta_desenlace_postergada: {
    titulo: "¿Ya podés contarnos qué pasó?",
    cuerpo: "Nos dijiste que necesitabas más tiempo. Contanos cómo terminó tu pedido.",
    ruta: (id) => (id ? `/pedidos/${id}/cerrar` : "/"),
  },
  // Cliente: moderacion resolvio un pedido en revision (D1).
  pedido_revision_aprobado: {
    titulo: "Tu pedido ya está publicado",
    cuerpo: "Lo revisamos y ya está visible para los profesionales.",
    ruta: (id) => (id ? `/pedidos/${id}` : "/"),
  },
  pedido_revision_rechazado: {
    titulo: "Tu pedido no se pudo publicar",
    cuerpo: "Revisá el motivo y los próximos pasos.",
    ruta: (id) => (id ? `/pedidos/${id}` : "/"),
  },
  // Cliente (dueño del pedido) (D5).
  pedido_bloqueado: {
    titulo: "Un pedido fue bloqueado",
    cuerpo: "Un moderador bloqueó este pedido. Te contamos los detalles.",
    ruta: (id) => (id ? `/pedidos/${id}` : "/"),
  },
  // Fix 4, revision de codigo del slice 10: cada profesional que ya estaba
  // elegido en un pedido bloqueado (D5) no puede ver `/pedidos/:id` (esa
  // ruta es solo del cliente dueño), asi que se le manda un tipo propio que
  // enlaza a su propio listado.
  pedido_bloqueado_elegido: {
    titulo: "Un pedido fue bloqueado",
    cuerpo: "Un moderador bloqueó un pedido donde te habían elegido.",
    ruta: () => "/postulaciones",
  },
  // Profesional: identidad o matricula resuelta.
  verificacion_resuelta: {
    titulo: "Tu verificación tiene novedades",
    cuerpo: "Ya revisamos tu identidad o matrícula. Mirá el resultado en tu perfil.",
    ruta: () => "/perfil",
  },
  // Cliente: primera postulacion a su pedido.
  primera_postulacion: {
    titulo: "Tenés una postulación nueva",
    cuerpo: "Un profesional se postuló a tu pedido.",
    ruta: (id) => (id ? `/pedidos/${id}` : "/"),
  },
  // Cliente: un elegido se retracto (docs/dominio.md §4).
  profesional_no_puede_tomarlo: {
    titulo: "Un profesional no puede tomar el trabajo",
    cuerpo: "El profesional que habías elegido avisó que no puede tomarlo.",
    ruta: (id) => (id ? `/pedidos/${id}` : "/"),
  },
  // Cliente: primera seleccion del pedido (D2/D3).
  contacto_habilitado: {
    titulo: "Ya podés contactar al profesional",
    cuerpo: "Elegiste a un profesional. Mirá sus datos de contacto.",
    ruta: (id) => (id ? `/pedidos/${id}/contacto` : "/"),
  },
  // Profesional elegido: objetoId es la Postulacion.
  postulacion_seleccionada: {
    titulo: "¡Te eligieron!",
    cuerpo: "Un cliente eligió tu postulación. Mirá los datos de contacto.",
    ruta: (id) => (id ? `/postulaciones/${id}/elegido` : "/postulaciones"),
  },
  // Profesional no elegido: se completo el cupo de elegibles del pedido.
  cliente_completo_eleccion: {
    titulo: "El cliente ya eligió a los profesionales",
    cuerpo: "El cliente completó su elección para este pedido.",
    ruta: () => "/postulaciones",
  },
  // Profesional no elegido: todavia queda cupo (D2/D3).
  cliente_eligio_a_otro: {
    titulo: "El cliente eligió a otro profesional",
    cuerpo: "Todavía podés ser elegido si queda cupo en este pedido.",
    ruta: () => "/postulaciones",
  },
};

export const TEXTO_NOTIFICACION_GENERICO: TextoNotificacion = {
  titulo: "Fixeo",
  cuerpo: "Tenés una notificación nueva",
  ruta: () => "/notificaciones",
};

export const notificacionVistaSchema = z.object({
  id: z.string().uuid(),
  tipo: z.string(),
  objetoId: z.string().uuid().nullable(),
  titulo: z.string(),
  cuerpo: z.string(),
  ruta: z.string(),
  leidaEn: z.string().nullable(),
  creadaEn: z.string(),
});

export type NotificacionVista = z.infer<typeof notificacionVistaSchema>;

export const notificacionPaginaSchema = z.object({
  items: z.array(notificacionVistaSchema),
  cursor: z.string().uuid().nullable(),
});

export type NotificacionPagina = z.infer<typeof notificacionPaginaSchema>;

export const notificacionesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
});

export type NotificacionesQuery = z.infer<typeof notificacionesQuerySchema>;

// Fix 2 (a), revision de codigo del slice 10: sin esta allowlist, cualquier
// usuario autenticado podia registrar una URL apuntando a un host interno de
// la propia infraestructura y lograr que el servidor le mande un POST cada
// vez que se dispara una notificacion hacia el (SSRF). Estos son los push
// services reales de los navegadores soportados: cualquier suscripcion real
// del navegador matchea alguno.
const HOSTS_PUSH_PERMITIDOS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
];

function hostPushPermitido(host: string): boolean {
  return HOSTS_PUSH_PERMITIDOS.includes(host) || host.endsWith(".notify.windows.com");
}

export const suscribirPushSchema = z.object({
  endpoint: z
    .string()
    .url()
    .refine((valor) => {
      try {
        const url = new URL(valor);
        return url.protocol === "https:" && hostPushPermitido(url.hostname);
      } catch {
        return false;
      }
    }, "El endpoint de la suscripción no es de un proveedor de push reconocido"),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type SuscribirPush = z.infer<typeof suscribirPushSchema>;

export const desuscribirPushSchema = z.object({
  endpoint: z.string().url(),
});

export type DesuscribirPush = z.infer<typeof desuscribirPushSchema>;
