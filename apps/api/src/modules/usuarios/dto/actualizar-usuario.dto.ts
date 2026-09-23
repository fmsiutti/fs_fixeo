import { createZodDto } from "nestjs-zod";
import { actualizarUsuarioSchema } from "@fixeo/shared";

export class ActualizarUsuarioDto extends createZodDto(actualizarUsuarioSchema) {}
