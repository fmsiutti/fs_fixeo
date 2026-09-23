import { randomUUID } from "node:crypto";

/**
 * Key de storage de un documento de verificacion. Vive en un solo lugar
 * (mismo criterio que claves-almacenamiento.ts de `archivos`) porque es
 * privada: nunca se calcula del lado del cliente ni se expone tal cual, solo
 * se resuelve a una url firmada de vida corta para un moderador.
 *
 * El nombre de archivo es un uuid random (no un indice secuencial): dos
 * subidas en paralelo del mismo profesional podrian leer el mismo largo de
 * `documentos` fuera de la transaccion y calcular el mismo indice, pisandose
 * la key una a la otra en el storage. Un uuid evita la colision sin
 * necesidad de leer el estado actual dentro de una transaccion.
 */
export function claveDocumentoVerificacion(
  perfilId: string,
  verificacionId: string,
  extension: string,
): string {
  return `verificaciones/${perfilId}/${verificacionId}/${randomUUID()}.${extension}`;
}
