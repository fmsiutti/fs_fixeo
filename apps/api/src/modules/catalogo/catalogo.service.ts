import { Injectable } from "@nestjs/common";
import type { BarrioVista, CategoriaVista } from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { mapearBarrioAVista, mapearCategoriaAVista } from "./catalogo.vistas.js";

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  async listarCategorias(): Promise<CategoriaVista[]> {
    const categorias = await this.prisma.categoria.findMany({
      where: { activa: true },
      orderBy: { nombre: "asc" },
    });
    return categorias.map(mapearCategoriaAVista);
  }

  async listarBarrios(): Promise<BarrioVista[]> {
    const barrios = await this.prisma.barrio.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
    });
    return barrios.map(mapearBarrioAVista);
  }
}
