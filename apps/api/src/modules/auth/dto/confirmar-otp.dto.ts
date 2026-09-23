import { createZodDto } from "nestjs-zod";
import { confirmarOtpSchema } from "@fixeo/shared";

export class ConfirmarOtpDto extends createZodDto(confirmarOtpSchema) {}
