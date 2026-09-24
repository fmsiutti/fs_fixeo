import { createZodDto } from "nestjs-zod";
import { listarPostulacionesQuerySchema } from "@fixeo/shared";

export class ListarPostulacionesQueryDto extends createZodDto(listarPostulacionesQuerySchema) {}
