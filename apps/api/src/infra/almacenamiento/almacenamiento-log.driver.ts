import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type {
  ProveedorAlmacenamiento,
  ResultadoAlmacenamiento,
} from "./proveedor-almacenamiento.js";
import {
  DIRECTORIO_ALMACENAMIENTO_LOG,
  DIRECTORIO_ALMACENAMIENTO_LOG_DOCUMENTOS,
  PREFIJO_ALMACENAMIENTO_LOG,
  PREFIJO_ALMACENAMIENTO_LOG_DOCUMENTOS,
} from "./almacenamiento.constants.js";

/**
 * Driver de desarrollo/tests: no sube a S3, guarda en disco local bajo
 * apps/api/uploads-dev/. Esa carpeta se sirve como estatica en main.ts
 * (solo si STORAGE_DRIVER=log) para que la URL devuelta sea servible.
 * Nunca se usa en produccion (seleccionado por STORAGE_DRIVER).
 *
 * `directorio`/`prefijo` son getters (no parametros de constructor) a
 * proposito: este driver no tiene dependencias que inyectar, y agregar
 * parametros de constructor de tipo `string` rompería la resolucion de Nest
 * (intentaria inyectar un provider para `String`). AlmacenamientoDocumentosLogDriver
 * los overridea para escribir en una carpeta separada y privada.
 *
 * Pendiente (no es parte de este slice): un archivo bajo borradores/{id}/
 * cuyo asistente se abandona nunca se limpia. Es trabajo para un job de
 * limpieza de storage futuro, no bloquea publicar pedidos.
 */
@Injectable()
export class AlmacenamientoLogDriver implements ProveedorAlmacenamiento {
  private readonly logger = new Logger(AlmacenamientoLogDriver.name);

  protected get directorio(): string {
    return DIRECTORIO_ALMACENAMIENTO_LOG;
  }

  protected get prefijo(): string {
    return PREFIJO_ALMACENAMIENTO_LOG;
  }

  async guardar(buffer: Buffer, key: string): Promise<ResultadoAlmacenamiento> {
    const rutaAbsoluta = join(this.directorio, key);
    await mkdir(dirname(rutaAbsoluta), { recursive: true });
    await writeFile(rutaAbsoluta, buffer);
    this.logger.log(`Archivo guardado en disco local: ${key}`);
    return { url: this.urlPara(key) };
  }

  async eliminar(key: string): Promise<void> {
    const rutaAbsoluta = join(this.directorio, key);
    // force: true hace que sea idempotente (no falla si el archivo ya no esta).
    await rm(rutaAbsoluta, { force: true });
  }

  async existe(key: string): Promise<boolean> {
    try {
      await access(join(this.directorio, key));
      return true;
    } catch {
      return false;
    }
  }

  urlPara(key: string): string {
    return `${this.prefijo}/${key}`;
  }

  async contar(prefijo: string): Promise<number> {
    try {
      const entradas = await readdir(join(this.directorio, prefijo));
      return entradas.length;
    } catch {
      // El directorio todavia no existe: cero archivos subidos bajo ese prefijo.
      return 0;
    }
  }

  // El disco local ya es privado (no hay bucket real que firmar): la "url
  // firmada" es la misma url estatica de siempre. `_ttlSegundos` se ignora a
  // proposito, solo esta para respetar la forma del driver real.
  async urlFirmada(key: string, _ttlSegundos: number): Promise<string> {
    return this.urlPara(key);
  }
}

/**
 * Variante de AlmacenamientoLogDriver para documentos de verificacion:
 * escribe bajo uploads-dev-privado/ en vez de uploads-dev/, carpeta que
 * main.ts nunca registra como estatica (ver almacenamiento.constants.ts).
 */
@Injectable()
export class AlmacenamientoDocumentosLogDriver extends AlmacenamientoLogDriver {
  protected override get directorio(): string {
    return DIRECTORIO_ALMACENAMIENTO_LOG_DOCUMENTOS;
  }

  protected override get prefijo(): string {
    return PREFIJO_ALMACENAMIENTO_LOG_DOCUMENTOS;
  }
}
