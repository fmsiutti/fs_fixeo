import { Controller, Get } from "@nestjs/common";
import type { BarrioVista, CategoriaVista } from "@fixeo/shared";
import { CatalogoService } from "./catalogo.service.js";

@Controller()
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Get("categorias")
  listarCategorias(): Promise<CategoriaVista[]> {
    return this.catalogoService.listarCategorias();
  }

  @Get("barrios")
  listarBarrios(): Promise<BarrioVista[]> {
    return this.catalogoService.listarBarrios();
  }
}
