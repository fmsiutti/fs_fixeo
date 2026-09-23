import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import { AlmacenamientoLogDriver } from "./almacenamiento-log.driver.js";
import { AlmacenamientoS3Driver } from "./almacenamiento-s3.driver.js";
import { PROVEEDOR_ALMACENAMIENTO } from "./proveedor-almacenamiento.js";

@Module({
  providers: [
    AlmacenamientoLogDriver,
    AlmacenamientoS3Driver,
    {
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
  ],
  exports: [PROVEEDOR_ALMACENAMIENTO],
})
export class AlmacenamientoModule {}
