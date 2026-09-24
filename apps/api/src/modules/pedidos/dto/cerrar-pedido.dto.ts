import { createZodDto } from "nestjs-zod";
import { cerrarPedidoSchema } from "@fixeo/shared";

export class CerrarPedidoDto extends createZodDto(cerrarPedidoSchema) {}
