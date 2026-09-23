import { join } from "node:path";

// Carpeta servida como estatica SOLO cuando STORAGE_DRIVER=log (ver main.ts).
// Nunca se usa en produccion: ahi el driver activo es AlmacenamientoS3Driver.
export const DIRECTORIO_ALMACENAMIENTO_LOG = join(process.cwd(), "uploads-dev");
export const PREFIJO_ALMACENAMIENTO_LOG = "/uploads-dev";
