import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";

const REDIS_URL_DEFAULT = "redis://localhost:6379";

/**
 * Opciones de conexion, no un cliente ioredis ya instanciado: BullMQ crea una
 * conexion nueva por cada Queue/Worker que arma a partir de estas opciones.
 * Un Worker usa comandos bloqueantes (BRPOPLPUSH) que ocupan la conexion
 * entera; si Queue (quien encola, PedidosService) y Worker (quien procesa,
 * AvisoMatchingProcessor) compartieran la misma conexion ya instanciada, un
 * `queue.add()` se quedaria esperando a que el worker "suelte" la conexion.
 *
 * Sin tipar contra `ioredis.RedisOptions`: BullMQ declara su propio tipo
 * `RedisOptions` (mas chico) para `connection`, estructuralmente compatible
 * con este objeto pero no identico, asi que se deja que TS infiera el tipo.
 */
function opcionesDeConexion(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    // BullMQ lo exige: sin esto, los workers fallan al arrancar.
    maxRetriesPerRequest: null,
    // Un Redis caido no puede tumbar el arranque de toda la app: solo el
    // aviso de matching queda degradado mientras Redis vuelve.
    retryStrategy: (intentos: number) => Math.min(intentos * 1000, 10_000),
  };
}

/**
 * Registra la conexion compartida de BullMQ (Redis + BullMQ ya son stack de
 * infra propia, docker-compose los levanta igual que Postgres: no necesitan
 * el patron de driver seleccionable de los proveedores externos,
 * CLAUDE.md #3). Se importa una sola vez en AppModule; `BullModule.forRootAsync`
 * registra su configuracion como modulo global, asi que los `BullModule.registerQueue(...)`
 * de otros modulos (PedidosModule, JobsModule) la encuentran sin volver a importar esto.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const redisUrl = configService.get("REDIS_URL", { infer: true }) ?? REDIS_URL_DEFAULT;
        return { connection: opcionesDeConexion(redisUrl) };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
