// Nombre de la cola de BullMQ para el aviso inicial de matching (slice 5,
// docs/dominio.md §6). Vive en un archivo aparte para que quien encola
// (PedidosService) y quien procesa (AvisoMatchingProcessor) lo importen sin
// depender uno del modulo del otro.
export const COLA_AVISO_MATCHING = "aviso-matching";

export interface AvisoMatchingJobData {
  pedidoId: string;
}

/**
 * Opciones por defecto de todas las colas del piloto (revision de codigo del
 * slice 5): sin esto, BullMQ no reintenta por default (1 solo intento). Si el
 * processor se cae a mitad de notificar a los 30 profesionales, los que
 * faltaban no se avisan nunca. `removeOnComplete`/`removeOnFail` evitan que
 * Redis acumule jobs viejos sin limite.
 */
export const OPCIONES_JOB_POR_DEFECTO = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

// Slice 8 (docs/dominio.md §9, apps/api/CLAUDE.md "Jobs"): un solo barrido
// periodico que consulta la base, en vez de un job diferido por pedido
// (patron distinto al de aviso-matching, que si es puntual por pedido). Una
// sola cola con 6 jobs nombrados (BullMQ los distingue por `job.name`): no
// hay ninguno con SLA distinto que justifique una cola aparte.
export const COLA_BARRIDOS_PEDIDOS = "barridos-pedidos";

export const NOMBRES_BARRIDO_PEDIDOS = [
  "expiracion",
  "aviso-expiracion",
  "aviso-sin-postulaciones",
  "consulta-contacto",
  "consulta-desenlace",
  "cierre-automatico",
] as const;

export type NombreBarridoPedidos = (typeof NOMBRES_BARRIDO_PEDIDOS)[number];

// Cada 15 minutos: ninguno de los 6 barridos tiene un SLA mas ajustado.
export const PATRON_BARRIDOS_PEDIDOS = "*/15 * * * *";
