import { createZodDto } from "nestjs-zod";
import { editarBarrioSchema } from "@fixeo/shared";

export class EditarBarrioDto extends createZodDto(editarBarrioSchema) {}
