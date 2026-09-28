import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.schema.js";
import {
  DIRECTORIO_ALMACENAMIENTO_LOG,
  PREFIJO_ALMACENAMIENTO_LOG,
} from "./infra/almacenamiento/almacenamiento.constants.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<Env, true>);

  // La carpeta de disco del driver "log" de almacenamiento solo tiene
  // sentido servirla en desarrollo: en produccion el driver activo es S3/R2.
  if (configService.get("STORAGE_DRIVER", { infer: true }) === "log") {
    app.useStaticAssets(DIRECTORIO_ALMACENAMIENTO_LOG, { prefix: PREFIJO_ALMACENAMIENTO_LOG });
  }

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

  // Endurecimiento basico de slice 10 (sin `helmet`: son 4 headers fijos, no
  // hace falta la dependencia). Sin CSP a proposito: requeriria probarla
  // contra el front real para no romper nada, y no hay forma de verificarlo
  // en este entorno.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    next();
  });

  const port = configService.get("PORT", { infer: true });
  await app.listen(port);
}

void bootstrap();
