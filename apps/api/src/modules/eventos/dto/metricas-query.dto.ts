import { createZodDto } from "nestjs-zod";
import { metricasQuerySchema } from "@fixeo/shared";

export class MetricasQueryDto extends createZodDto(metricasQuerySchema) {}
