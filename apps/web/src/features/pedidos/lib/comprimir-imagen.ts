const DIMENSION_MAXIMA_PX = 1600;
const CALIDAD_JPEG = 0.82;

/**
 * Comprime una foto en el dispositivo antes de subirla (apps/web/CLAUDE.md:
 * "comprimir en el dispositivo -canvas- antes de subir"). Si algo falla o el
 * browser no soporta la API, sube el archivo original: es una optimizacion,
 * no debe bloquear la publicacion del pedido.
 */
export async function comprimirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/") || typeof createImageBitmap !== "function") {
    return archivo;
  }

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, DIMENSION_MAXIMA_PX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext("2d");
    if (!contexto) return archivo;

    contexto.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG),
    );
    if (!blob) return archivo;

    const nombreBase = archivo.name.replace(/\.[^./\\]+$/, "");
    return new File([blob], `${nombreBase}.jpg`, { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}
