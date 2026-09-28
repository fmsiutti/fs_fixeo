import { z } from "zod";

// AD-05: filtros del tablero (docs/dominio.md §10). Sin default aca: el
// service (MetricasService) decide el default de "ultimos 30 dias" para que
// la regla viva en un solo lugar, no duplicada entre contrato y service.
export const metricasQuerySchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  categoriaId: z.string().uuid().optional(),
  barrioId: z.string().uuid().optional(),
});

export type MetricasQuery = z.infer<typeof metricasQuerySchema>;

// AD-05: metricas del funnel (docs/dominio.md §10). Todos los porcentajes
// son 0-100 (nunca 0-1), y `null` cuando no hay datos suficientes en el
// rango (p. ej. cero pedidos publicados): nunca `NaN` ni division por cero.
// D16: mismas metricas que el tablero global, desglosadas por categoria (sin
// finalizacionAsistentePorcentaje: la aproximacion por conteo de eventos ya
// es floja para el total global, partirla por categoria con volumenes de
// piloto la vuelve inutil).
export const metricasCategoriaVistaSchema = z.object({
  categoria: z.object({ id: z.string().uuid(), nombre: z.string(), slug: z.string() }),
  totalPedidosPublicados: z.number(),
  coberturaSeisHorasPorcentaje: z.number().nullable(),
  medianaMinutosPrimeraPostulacion: z.number().nullable(),
  tasaContactoPorcentaje: z.number().nullable(),
  tasaTrabajoDeclaradoPorcentaje: z.number().nullable(),
  tasaSeleccionMedianaPorcentaje: z.number().nullable(),
});
export type MetricasCategoriaVista = z.infer<typeof metricasCategoriaVistaSchema>;

export const metricasTableroVistaSchema = z.object({
  rango: z.object({
    desde: z.string(),
    hasta: z.string(),
  }),
  totalPedidosPublicados: z.number(),
  coberturaSeisHorasPorcentaje: z.number().nullable(),
  medianaMinutosPrimeraPostulacion: z.number().nullable(),
  tasaContactoPorcentaje: z.number().nullable(),
  tasaTrabajoDeclaradoPorcentaje: z.number().nullable(),
  finalizacionAsistentePorcentaje: z.number().nullable(),
  tasaSeleccionMedianaPorcentaje: z.number().nullable(),
  // D16: tabla desglosada por categoria, mismo rango/zona que el tablero
  // global (nunca cruzado zona x categoria, ver metricas.service.ts).
  porCategoria: z.array(metricasCategoriaVistaSchema),
});

export type MetricasTableroVista = z.infer<typeof metricasTableroVistaSchema>;
