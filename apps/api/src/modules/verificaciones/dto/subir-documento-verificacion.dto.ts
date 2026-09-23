import { createZodDto } from "nestjs-zod";
import { subirDocumentoVerificacionSchema } from "@fixeo/shared";

export class SubirDocumentoVerificacionDto extends createZodDto(subirDocumentoVerificacionSchema) {}
