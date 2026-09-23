export interface ResultadoAlmacenamiento {
  url: string;
}

/**
 * Borde con el proveedor de almacenamiento de archivos (S3-compatible: S3 o
 * R2). Dos implementaciones: `log` (desarrollo/tests, disco local) y `s3`
 * (real), elegidas por `STORAGE_DRIVER`. Mismo patron que infra/twilio/.
 */
export interface ProveedorAlmacenamiento {
  guardar(buffer: Buffer, key: string, contentType: string): Promise<ResultadoAlmacenamiento>;
  eliminar(key: string): Promise<void>;
  /** true si ya existe un objeto guardado en esa key. */
  existe(key: string): Promise<boolean>;
  /** La url que tendria un objeto en esa key, sin tocar el storage (calculo puro). */
  urlPara(key: string): string;
  /** Cuantos objetos hay bajo ese prefijo (para topar subidas por borradorId). */
  contar(prefijo: string): Promise<number>;
  /**
   * URL firmada de vida corta para un objeto privado (documentos de
   * verificacion, CLAUDE.md "cada acceso se registra"). `ttlSegundos` lo
   * decide quien llama, nunca el driver.
   */
  urlFirmada(key: string, ttlSegundos: number): Promise<string>;
}

export const PROVEEDOR_ALMACENAMIENTO = Symbol("PROVEEDOR_ALMACENAMIENTO");

/**
 * Segundo proveedor, apuntado a un bucket/carpeta distinto y privado: solo
 * para documentos de verificacion (DNI, matricula). Nunca se comparte el
 * bucket de fotos de pedido (publico) con estos documentos (CLAUDE.md §9,
 * "documentos de verificacion cifrados, en bucket privado").
 */
export const PROVEEDOR_ALMACENAMIENTO_DOCUMENTOS = Symbol("PROVEEDOR_ALMACENAMIENTO_DOCUMENTOS");
