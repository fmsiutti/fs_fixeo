import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import { PROVEEDOR_WEB_PUSH } from "./proveedor-web-push.js";
import { WebPushLogDriver } from "./web-push-log.driver.js";
import { WebPushVapidDriver } from "./web-push-vapid.driver.js";

@Module({
  providers: [
    WebPushLogDriver,
    WebPushVapidDriver,
    {
      provide: PROVEEDOR_WEB_PUSH,
      useFactory: (
        configService: ConfigService<Env, true>,
        logDriver: WebPushLogDriver,
        vapidDriver: WebPushVapidDriver,
      ) => {
        const driver = configService.get("WEB_PUSH_DRIVER", { infer: true });
        return driver === "vapid" ? vapidDriver : logDriver;
      },
      inject: [ConfigService, WebPushLogDriver, WebPushVapidDriver],
    },
  ],
  exports: [PROVEEDOR_WEB_PUSH],
})
export class WebPushModule {}
