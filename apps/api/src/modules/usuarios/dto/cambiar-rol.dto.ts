import { createZodDto } from "nestjs-zod";
import { cambiarRolSchema } from "@fixeo/shared";

export class CambiarRolDto extends createZodDto(cambiarRolSchema) {}
