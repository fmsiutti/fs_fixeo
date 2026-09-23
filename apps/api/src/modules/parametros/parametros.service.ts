import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

const TTL_CACHE_MS = 60_000;

@Injectable()
export class ParametrosService {
  private cache = new Map<string, unknown>();
  private cacheCargadaEn = 0;

  constructor(private readonly prisma: PrismaService) {}

  /** Lee un parametro de negocio numerico (tabla parametro_negocio). Nunca hardcodear el valor en el service que lo consume. */
  async getNumero(clave: string): Promise<number> {
    const valor = await this.buscar(clave);
    if (typeof valor !== "number") {
      throw new InternalServerErrorException(
        `El parametro de negocio "${clave}" deberia ser numerico y no lo es`,
      );
    }
    return valor;
  }

  /** Lee un parametro de negocio de texto (hoy solo `limite_diario_zona_horaria`). */
  async getTexto(clave: string): Promise<string> {
    const valor = await this.buscar(clave);
    if (typeof valor !== "string") {
      throw new InternalServerErrorException(
        `El parametro de negocio "${clave}" deberia ser texto y no lo es`,
      );
    }
    return valor;
  }

  private async buscar(clave: string): Promise<unknown> {
    await this.asegurarCache();

    if (!this.cache.has(clave)) {
      // Un parametro sin sembrar es una falla de configuracion del servidor
      // (no un recurso que pidio mal el cliente): 500 + log, no 404.
      throw new InternalServerErrorException(`No existe el parametro de negocio "${clave}"`);
    }

    return this.cache.get(clave);
  }

  private async asegurarCache(): Promise<void> {
    const vencida = Date.now() - this.cacheCargadaEn > TTL_CACHE_MS;
    if (this.cache.size > 0 && !vencida) return;

    const parametros = await this.prisma.parametroNegocio.findMany();
    this.cache = new Map(parametros.map((parametro) => [parametro.clave, parametro.valor]));
    this.cacheCargadaEn = Date.now();
  }
}
