import { createZodDto } from "nestjs-zod";
import { crearNotaInternaSchema } from "@fixeo/shared";

export class CrearNotaInternaDto extends createZodDto(crearNotaInternaSchema) {}
