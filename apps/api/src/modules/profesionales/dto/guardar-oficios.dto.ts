import { createZodDto } from "nestjs-zod";
import { guardarOficiosSchema } from "@fixeo/shared";

export class GuardarOficiosDto extends createZodDto(guardarOficiosSchema) {}
