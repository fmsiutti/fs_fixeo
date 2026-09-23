import { join } from "node:path";

// Carpeta servida como estatica SOLO cuando STORAGE_DRIVER=log (ver main.ts).
// Nunca se usa en produccion: ahi el driver activo es AlmacenamientoS3Driver.
// Solo para archivos publicos (fotos de pedido).
export const DIRECTORIO_ALMACENAMIENTO_LOG = join(process.cwd(), "uploads-dev");
export const PREFIJO_ALMACENAMIENTO_LOG = "/uploads-dev";

// Carpeta separada para documentos de verificacion en desarrollo/tests:
// a proposito NUNCA se registra como estatica en main.ts, para que "privado"
// en dev se comporte de verdad como privado (nadie puede pegar la ruta en el
// navegador) y no dependa solo de que el driver real sea S3. `urlPara()`
// devuelve una ruta bajo esta carpeta igual, coherente con la forma del
// driver real, pero no es servible.
export const DIRECTORIO_ALMACENAMIENTO_LOG_DOCUMENTOS = join(process.cwd(), "uploads-dev-privado");
export const PREFIJO_ALMACENAMIENTO_LOG_DOCUMENTOS = "/uploads-dev-privado";
