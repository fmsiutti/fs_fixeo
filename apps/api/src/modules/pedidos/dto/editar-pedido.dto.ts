import { createZodDto } from "nestjs-zod";
import { editarPedidoSchema } from "@fixeo/shared";

export class EditarPedidoDto extends createZodDto(editarPedidoSchema) {}
