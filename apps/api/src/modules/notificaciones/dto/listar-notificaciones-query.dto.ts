import { createZodDto } from "nestjs-zod";
import { notificacionesQuerySchema } from "@fixeo/shared";

export class ListarNotificacionesQueryDto extends createZodDto(notificacionesQuerySchema) {}
