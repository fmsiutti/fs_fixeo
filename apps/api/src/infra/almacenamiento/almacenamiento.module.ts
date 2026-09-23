import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import {
  AlmacenamientoDocumentosLogDriver,
  AlmacenamientoLogDriver,
} from "./almacenamiento-log.driver.js";
import {
  AlmacenamientoDocumentosS3Driver,
  AlmacenamientoS3Driver,
} from "./almacenamiento-s3.driver.js";
import {
  PROVEEDOR_ALMACENAMIENTO,
  PROVEEDOR_ALMACENAMIENTO_DOCUMENTOS,
} from "./proveedor-almacenamiento.js";

@Module({
  providers: [
    AlmacenamientoLogDriver,
    AlmacenamientoS3Driver,
    AlmacenamientoDocumentosLogDriver,
    AlmacenamientoDocumentosS3Driver,
    {
      // Fotos de pedido: bucket/carpeta publicos.
      provide: PROVEEDOR_ALMACENAMIENTO,
      useFactory: (
        configService: ConfigService<Env, true>,
        logDriver: AlmacenamientoLogDriver,
        s3Driver: AlmacenamientoS3Driver,
      ) => {
        const driver = configService.get("STORAGE_DRIVER", { infer: true });
        return driver === "s3" ? s3Driver : logDriver;
      },
      inject: [ConfigService, AlmacenamientoLogDriver, AlmacenamientoS3Driver],
    },
    {
      // Documentos de verificacion: bucket/carpeta privados, distintos.
      provide: PROVEEDOR_ALMACENAMIENTO_DOCUMENTOS,
      useFactory: (
        configService: ConfigService<Env, true>,
        logDriver: AlmacenamientoDocumentosLogDriver,
        s3Driver: AlmacenamientoDocumentosS3Driver,
      ) => {
        const driver = configService.get("STORAGE_DRIVER", { infer: true });
        return driver === "s3" ? s3Driver : logDriver;
      },
      inject: [ConfigService, AlmacenamientoDocumentosLogDriver, AlmacenamientoDocumentosS3Driver],
    },
  ],
  exports: [PROVEEDOR_ALMACENAMIENTO, PROVEEDOR_ALMACENAMIENTO_DOCUMENTOS],
})
export class AlmacenamientoModule {}
