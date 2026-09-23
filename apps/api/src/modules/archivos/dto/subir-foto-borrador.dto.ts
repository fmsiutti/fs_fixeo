import { createZodDto } from "nestjs-zod";
import { borradorIdSchema } from "@fixeo/shared";

export class SubirFotoBorradorDto extends createZodDto(borradorIdSchema) {}
