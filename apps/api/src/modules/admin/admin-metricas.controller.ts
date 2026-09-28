import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { MetricasTableroVista } from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { MetricasQueryDto } from "../eventos/dto/metricas-query.dto.js";
import { MetricasService } from "../eventos/metricas.service.js";

// AD-05. Solo delega en MetricasService (apps/api/CLAUDE.md: el modulo
// `admin` es "solo controllers que delegan", sin logica propia).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/metricas")
export class AdminMetricasController {
  constructor(private readonly metricasService: MetricasService) {}

  @Get()
  @Roles("moderador", "soporte")
  obtenerTablero(@Query() query: MetricasQueryDto): Promise<MetricasTableroVista> {
    return this.metricasService.obtenerTablero(query);
  }
}
