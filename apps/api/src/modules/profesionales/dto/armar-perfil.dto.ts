import { createZodDto } from "nestjs-zod";
import { armarPerfilSchema } from "@fixeo/shared";

export class ArmarPerfilDto extends createZodDto(armarPerfilSchema) {}
