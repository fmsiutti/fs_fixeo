import { createZodDto } from "nestjs-zod";
import { usuarioBusquedaQuerySchema } from "@fixeo/shared";

export class UsuarioBusquedaQueryDto extends createZodDto(usuarioBusquedaQuerySchema) {}
