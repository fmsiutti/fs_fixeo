import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { BarrioAdminVista, CategoriaAdminVista } from "@fixeo/shared";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { CatalogoService } from "../catalogo/catalogo.service.js";
import { CrearCategoriaDto } from "../catalogo/dto/crear-categoria.dto.js";
import { EditarBarrioDto } from "../catalogo/dto/editar-barrio.dto.js";
import { EditarCategoriaDto } from "../catalogo/dto/editar-categoria.dto.js";

// AD-04. Solo delega en CatalogoService (apps/api/CLAUDE.md: el modulo
// `admin` es "solo controllers que delegan", sin logica propia).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/catalogo")
export class AdminCatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  // Soporte tambien puede ver el catalogo completo (solo lectura en todo el
  // back office); crear y editar quedan solo para moderador.
  @Get("categorias")
  @Roles("moderador", "soporte")
  listarCategorias(): Promise<CategoriaAdminVista[]> {
    return this.catalogoService.listarCategoriasAdmin();
  }

  @Post("categorias")
  @Roles("moderador")
  crearCategoria(@Body() dto: CrearCategoriaDto): Promise<CategoriaAdminVista> {
    return this.catalogoService.crearCategoria(dto);
  }

  @Patch("categorias/:id")
  @Roles("moderador")
  editarCategoria(
    @Param("id") id: string,
    @Body() dto: EditarCategoriaDto,
  ): Promise<CategoriaAdminVista> {
    return this.catalogoService.editarCategoria(id, dto);
  }

  @Get("barrios")
  @Roles("moderador", "soporte")
  listarBarrios(): Promise<BarrioAdminVista[]> {
    return this.catalogoService.listarBarriosAdmin();
  }

  @Patch("barrios/:id")
  @Roles("moderador")
  editarBarrio(@Param("id") id: string, @Body() dto: EditarBarrioDto): Promise<BarrioAdminVista> {
    return this.catalogoService.editarBarrio(id, dto);
  }
}
