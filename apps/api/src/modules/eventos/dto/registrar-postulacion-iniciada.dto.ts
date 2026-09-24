import { createZodDto } from "nestjs-zod";
import { registrarPostulacionIniciadaSchema } from "@fixeo/shared";

export class RegistrarPostulacionIniciadaDto extends createZodDto(
  registrarPostulacionIniciadaSchema,
) {}
