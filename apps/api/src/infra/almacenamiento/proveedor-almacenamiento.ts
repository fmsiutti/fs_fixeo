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
}

export const PROVEEDOR_ALMACENAMIENTO = Symbol("PROVEEDOR_ALMACENAMIENTO");
