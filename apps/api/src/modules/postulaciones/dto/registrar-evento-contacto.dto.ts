import { createZodDto } from "nestjs-zod";
import { registrarEventoContactoSchema } from "@fixeo/shared";

export class RegistrarEventoContactoDto extends createZodDto(registrarEventoContactoSchema) {}
