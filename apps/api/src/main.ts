import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.schema.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<Env, true>);
  const port = configService.get("PORT", { infer: true });
  await app.listen(port);
}

void bootstrap();
