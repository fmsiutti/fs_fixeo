import { createZodDto } from "nestjs-zod";
import { crearDenunciaSchema } from "@fixeo/shared";

export class CrearDenunciaDto extends createZodDto(crearDenunciaSchema) {}
