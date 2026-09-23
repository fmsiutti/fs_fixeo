import { z } from "zod";

const optionalString = () =>
  z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  REDIS_URL: optionalString(),
  // Origen de apps/web para CORS. En desarrollo, el puerto por default de `vite`.
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET es requerida"),
  TWILIO_DRIVER: z.enum(["log", "twilio"]).default("log"),
  TWILIO_ACCOUNT_SID: optionalString(),
  TWILIO_AUTH_TOKEN: optionalString(),
  TWILIO_VERIFY_SERVICE_SID: optionalString(),
  STORAGE_DRIVER: z.enum(["log", "s3"]).default("log"),
  S3_ENDPOINT: optionalString(),
  S3_REGION: optionalString(),
  S3_BUCKET: optionalString(),
  S3_ACCESS_KEY_ID: optionalString(),
  S3_SECRET_ACCESS_KEY: optionalString(),
  WEB_PUSH_VAPID_PUBLIC_KEY: optionalString(),
  WEB_PUSH_VAPID_PRIVATE_KEY: optionalString(),
  WHATSAPP_CLOUD_API_TOKEN: optionalString(),
  WHATSAPP_CLOUD_API_PHONE_NUMBER_ID: optionalString(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Variables de entorno invalidas:\n${parsed.error.message}`);
  }
  return parsed.data;
}
