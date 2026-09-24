import { createZodDto } from "nestjs-zod";
import { responderReseniaSchema } from "@fixeo/shared";

export class ResponderReseniaDto extends createZodDto(responderReseniaSchema) {}
