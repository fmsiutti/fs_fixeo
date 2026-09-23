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
