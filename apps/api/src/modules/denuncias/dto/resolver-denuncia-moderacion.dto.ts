import { createZodDto } from "nestjs-zod";
import { resolverDenunciaModeracionSchema } from "@fixeo/shared";

export class ResolverDenunciaModeracionDto extends createZodDto(resolverDenunciaModeracionSchema) {}
