import { createZodDto } from "nestjs-zod";
import { editarCategoriaSchema } from "@fixeo/shared";

export class EditarCategoriaDto extends createZodDto(editarCategoriaSchema) {}
