import { createZodDto } from "nestjs-zod";
import { crearPlantillaMensajeSchema } from "@fixeo/shared";

export class CrearPlantillaMensajeDto extends createZodDto(crearPlantillaMensajeSchema) {}
