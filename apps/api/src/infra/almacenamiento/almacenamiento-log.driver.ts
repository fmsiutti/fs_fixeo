import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type {
  ProveedorAlmacenamiento,
  ResultadoAlmacenamiento,
} from "./proveedor-almacenamiento.js";
import {
  DIRECTORIO_ALMACENAMIENTO_LOG,
  PREFIJO_ALMACENAMIENTO_LOG,
} from "./almacenamiento.constants.js";

/**
 * Driver de desarrollo/tests: no sube a S3, guarda en disco local bajo
 * apps/api/uploads-dev/. Esa carpeta se sirve como estatica en main.ts
 * (solo si STORAGE_DRIVER=log) para que la URL devuelta sea servible.
 * Nunca se usa en produccion (seleccionado por STORAGE_DRIVER).
 *
 * Pendiente (no es parte de este slice): un archivo bajo borradores/{id}/
 * cuyo asistente se abandona nunca se limpia. Es trabajo para un job de
 * limpieza de storage futuro, no bloquea publicar pedidos.
 */
@Injectable()
export class AlmacenamientoLogDriver implements ProveedorAlmacenamiento {
  private readonly logger = new Logger(AlmacenamientoLogDriver.name);

  async guardar(buffer: Buffer, key: string): Promise<ResultadoAlmacenamiento> {
    const rutaAbsoluta = join(DIRECTORIO_ALMACENAMIENTO_LOG, key);
    await mkdir(dirname(rutaAbsoluta), { recursive: true });
    await writeFile(rutaAbsoluta, buffer);
    this.logger.log(`Archivo guardado en disco local: ${key}`);
    return { url: this.urlPara(key) };
  }

  async eliminar(key: string): Promise<void> {
    const rutaAbsoluta = join(DIRECTORIO_ALMACENAMIENTO_LOG, key);
    // force: true hace que sea idempotente (no falla si el archivo ya no esta).
    await rm(rutaAbsoluta, { force: true });
  }

  async existe(key: string): Promise<boolean> {
    try {
      await access(join(DIRECTORIO_ALMACENAMIENTO_LOG, key));
      return true;
    } catch {
      return false;
    }
  }

  urlPara(key: string): string {
    return `${PREFIJO_ALMACENAMIENTO_LOG}/${key}`;
  }

  async contar(prefijo: string): Promise<number> {
    try {
      const entradas = await readdir(join(DIRECTORIO_ALMACENAMIENTO_LOG, prefijo));
      return entradas.length;
    } catch {
      // El directorio todavia no existe: cero archivos subidos bajo ese prefijo.
      return 0;
    }
  }
}
