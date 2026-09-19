import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { validateEnv } from "./config/env.schema.js";
import { PrismaModule } from "./infra/prisma/prisma.module.js";
import { ParametrosModule } from "./modules/parametros/parametros.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ParametrosModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
