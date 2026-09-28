/**
 * AD-04: subcategorias y preguntasGuia se cargan como una lista en un
 * textarea (una por renglon). Convierte ese texto en el array que espera el
 * contrato, descartando renglones vacios.
 */
export function parsearLineas(texto: string): string[] {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
}
