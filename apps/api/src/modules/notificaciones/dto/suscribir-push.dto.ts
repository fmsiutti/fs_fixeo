import { createZodDto } from "nestjs-zod";
import { suscribirPushSchema } from "@fixeo/shared";

export class SuscribirPushDto extends createZodDto(suscribirPushSchema) {}
