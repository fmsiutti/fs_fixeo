import { createZodDto } from "nestjs-zod";
import { denunciaModeracionColaQuerySchema } from "@fixeo/shared";

export class DenunciaModeracionColaQueryDto extends createZodDto(
  denunciaModeracionColaQuerySchema,
) {}
