import { createZodDto } from "nestjs-zod";
import { registrarEventoSchema } from "@fixeo/shared";

export class RegistrarEventoDto extends createZodDto(registrarEventoSchema) {}
