import { createZodDto } from "nestjs-zod";
import { listarReseniasQuerySchema } from "@fixeo/shared";

export class ListarReseniasQueryDto extends createZodDto(listarReseniasQuerySchema) {}
