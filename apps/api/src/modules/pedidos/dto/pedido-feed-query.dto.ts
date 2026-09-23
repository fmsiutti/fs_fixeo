import { createZodDto } from "nestjs-zod";
import { pedidoFeedFiltrosSchema } from "@fixeo/shared";

export class PedidoFeedQueryDto extends createZodDto(pedidoFeedFiltrosSchema) {}
