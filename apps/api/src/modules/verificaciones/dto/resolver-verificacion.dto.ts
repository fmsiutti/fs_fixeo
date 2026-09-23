import { createZodDto } from "nestjs-zod";
import { resolverVerificacionSchema } from "@fixeo/shared";

export class ResolverVerificacionDto extends createZodDto(resolverVerificacionSchema) {}
