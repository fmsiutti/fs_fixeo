import { createZodDto } from "nestjs-zod";
import { pedidoModeracionColaQuerySchema } from "@fixeo/shared";

export class PedidoModeracionColaQueryDto extends createZodDto(pedidoModeracionColaQuerySchema) {}
