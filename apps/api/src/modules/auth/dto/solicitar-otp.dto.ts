import { createZodDto } from "nestjs-zod";
import { solicitarOtpSchema } from "@fixeo/shared";

export class SolicitarOtpDto extends createZodDto(solicitarOtpSchema) {}
