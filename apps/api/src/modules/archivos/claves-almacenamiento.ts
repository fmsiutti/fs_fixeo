/**
 * Key de storage para una foto del asistente de publicar pedido. Vive en un
 * solo lugar porque tanto `archivos` (sube/borra) como `pedidos` (verifica
 * que la foto exista antes de asociarla al publicar) tienen que construir
 * exactamente la misma key a partir de los mismos dos ids.
 */
export function clavePedidoFotoBorrador(borradorId: string, fotoId: string): string {
  return `borradores/${borradorId}/${fotoId}.jpg`;
}

export function prefijoBorrador(borradorId: string): string {
  return `borradores/${borradorId}/`;
}
