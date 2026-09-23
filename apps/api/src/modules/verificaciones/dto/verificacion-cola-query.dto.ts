import { createZodDto } from "nestjs-zod";
import { verificacionColaQuerySchema } from "@fixeo/shared";

export class VerificacionColaQueryDto extends createZodDto(verificacionColaQuerySchema) {}
