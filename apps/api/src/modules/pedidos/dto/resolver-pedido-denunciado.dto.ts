import { createZodDto } from "nestjs-zod";
import { resolverPedidoDenunciadoSchema } from "@fixeo/shared";

export class ResolverPedidoDenunciadoDto extends createZodDto(resolverPedidoDenunciadoSchema) {}
