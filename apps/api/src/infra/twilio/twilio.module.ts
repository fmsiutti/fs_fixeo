import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import { PROVEEDOR_OTP } from "./proveedor-otp.js";
import { TwilioLogDriver } from "./twilio-log.driver.js";
import { TwilioRealDriver } from "./twilio-real.driver.js";

@Module({
  providers: [
    TwilioLogDriver,
    TwilioRealDriver,
    {
      provide: PROVEEDOR_OTP,
      useFactory: (
        configService: ConfigService<Env, true>,
        logDriver: TwilioLogDriver,
        realDriver: TwilioRealDriver,
      ) => {
        const driver = configService.get("TWILIO_DRIVER", { infer: true });
        return driver === "twilio" ? realDriver : logDriver;
      },
      inject: [ConfigService, TwilioLogDriver, TwilioRealDriver],
    },
  ],
  exports: [PROVEEDOR_OTP],
})
export class TwilioModule {}
