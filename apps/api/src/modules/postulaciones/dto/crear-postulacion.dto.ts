import { createZodDto } from "nestjs-zod";
import { crearPostulacionSchema } from "@fixeo/shared";

export class CrearPostulacionDto extends createZodDto(crearPostulacionSchema) {}
