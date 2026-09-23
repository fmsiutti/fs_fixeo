import { createZodDto } from "nestjs-zod";
import { borradorIdSchema } from "@fixeo/shared";

export class EliminarFotoBorradorDto extends createZodDto(borradorIdSchema) {}
