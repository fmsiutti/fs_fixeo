import { createZodDto } from "nestjs-zod";
import { crearPedidoSchema } from "@fixeo/shared";

export class CrearPedidoDto extends createZodDto(crearPedidoSchema) {}
