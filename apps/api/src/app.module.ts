import cookieParser from "cookie-parser";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { AppController } from "./app.controller.js";
import { validateEnv } from "./config/env.schema.js";
import { FiltroErrores } from "./common/filters/errores.filter.js";
import { PrismaModule } from "./infra/prisma/prisma.module.js";
import { ParametrosModule } from "./modules/parametros/parametros.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { UsuariosModule } from "./modules/usuarios/usuarios.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ParametrosModule,
    AuthModule,
    UsuariosModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: FiltroErrores },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes("*");
  }
}
