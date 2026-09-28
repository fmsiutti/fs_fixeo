import { createZodDto } from "nestjs-zod";
import { suspenderUsuarioSchema } from "@fixeo/shared";

export class SuspenderUsuarioDto extends createZodDto(suspenderUsuarioSchema) {}
