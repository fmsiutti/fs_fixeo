import { createZodDto } from "nestjs-zod";
import { resolverEnRevisionSchema } from "@fixeo/shared";

export class ResolverEnRevisionDto extends createZodDto(resolverEnRevisionSchema) {}
