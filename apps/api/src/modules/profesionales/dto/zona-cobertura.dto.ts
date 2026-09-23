import { createZodDto } from "nestjs-zod";
import { zonaCoberturaSchema } from "@fixeo/shared";

// Sin `class X extends createZodDto(...)`: zonaCoberturaSchema es una union
// discriminada, y TS no permite extender un constructor cuyo tipo de retorno
// es una union de shapes disjuntas (TS2509). El patron const + type con el
// mismo nombre sigue siendo un "ZodDto" valido en runtime (isZodDto, schema)
// y usable como tipo en `@Body()`.
export const ZonaCoberturaDto = createZodDto(zonaCoberturaSchema);
export type ZonaCoberturaDto = InstanceType<typeof ZonaCoberturaDto>;
