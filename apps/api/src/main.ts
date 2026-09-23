import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.schema.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<Env, true>);

  // Confia solo en el primer proxy (el balanceador/reverse-proxy propio):
  // sin esto, `request.ip` (usado por LimiteSolicitudesGuard) devuelve la IP
  // del proxy para todos los requests y el limite por IP termina siendo
  // global en vez de por cliente. Confiar de mas hace que `X-Forwarded-For`
  // sea spoofeable, por eso es 1 salto, no `true`.
  app.set("trust proxy", 1);
  app.enableCors({
    origin: configService.get("CORS_ORIGIN", { infer: true }),
    credentials: true,
  });

  const port = configService.get("PORT", { infer: true });
  await app.listen(port);
}

void bootstrap();
