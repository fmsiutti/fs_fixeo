import { createZodDto } from "nestjs-zod";
import { crearCategoriaSchema } from "@fixeo/shared";

export class CrearCategoriaDto extends createZodDto(crearCategoriaSchema) {}
