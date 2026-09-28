import { createZodDto } from "nestjs-zod";
import { desuscribirPushSchema } from "@fixeo/shared";

export class DesuscribirPushDto extends createZodDto(desuscribirPushSchema) {}
