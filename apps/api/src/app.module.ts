import cookieParser from "cookie-parser";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { AppController } from "./app.controller.js";
import { validateEnv } from "./config/env.schema.js";
import { FiltroErrores } from "./common/filters/errores.filter.js";
import { PrismaModule } from "./infra/prisma/prisma.module.js";
import { QueueModule } from "./infra/queue/queue.module.js";
import { ParametrosModule } from "./modules/parametros/parametros.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { UsuariosModule } from "./modules/usuarios/usuarios.module.js";
import { CatalogoModule } from "./modules/catalogo/catalogo.module.js";
import { ArchivosModule } from "./modules/archivos/archivos.module.js";
import { EventosModule } from "./modules/eventos/eventos.module.js";
import { PedidosModule } from "./modules/pedidos/pedidos.module.js";
import { ProfesionalesModule } from "./modules/profesionales/profesionales.module.js";
import { NotificacionesModule } from "./modules/notificaciones/notificaciones.module.js";
import { VerificacionesModule } from "./modules/verificaciones/verificaciones.module.js";
import { DenunciasModule } from "./modules/denuncias/denuncias.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { JobsModule } from "./jobs/jobs.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    QueueModule,
    ParametrosModule,
    AuthModule,
    UsuariosModule,
    CatalogoModule,
    ArchivosModule,
    EventosModule,
    PedidosModule,
    ProfesionalesModule,
    NotificacionesModule,
    VerificacionesModule,
    DenunciasModule,
    AdminModule,
    JobsModule,
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
