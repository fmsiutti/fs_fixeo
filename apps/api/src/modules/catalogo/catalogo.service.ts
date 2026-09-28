import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BarrioAdminVista,
  BarrioVista,
  CategoriaAdminVista,
  CategoriaVista,
  CrearCategoria,
  EditarBarrio,
  EditarCategoria,
} from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  mapearBarrioAVista,
  mapearBarrioAVistaAdmin,
  mapearCategoriaAVista,
  mapearCategoriaAVistaAdmin,
} from "./catalogo.vistas.js";

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

  /** AD-04: sin filtro `activa`, el moderador tiene que ver tambien las que desactivo. */
  async listarCategoriasAdmin(): Promise<CategoriaAdminVista[]> {
    const categorias = await this.prisma.categoria.findMany({ orderBy: { nombre: "asc" } });
    return categorias.map(mapearCategoriaAVistaAdmin);
  }

  async crearCategoria(datos: CrearCategoria): Promise<CategoriaAdminVista> {
    const existente = await this.prisma.categoria.findUnique({ where: { slug: datos.slug } });
    if (existente) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Ya existe una categoría con ese slug",
      });
    }

    const categoria = await this.prisma.categoria.create({
      data: {
        nombre: datos.nombre,
        slug: datos.slug,
        subcategorias: datos.subcategorias,
        preguntasGuia: datos.preguntasGuia,
        requiereMatricula: datos.requiereMatricula,
        activa: true,
      },
    });
    return mapearCategoriaAVistaAdmin(categoria);
  }

  /** AD-04: sin slug editable (es la clave estable de la categoria, ver editarCategoriaSchema). */
  async editarCategoria(id: string, datos: EditarCategoria): Promise<CategoriaAdminVista> {
    const existente = await this.prisma.categoria.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La categoría no existe" });
    }

    const categoria = await this.prisma.categoria.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        subcategorias: datos.subcategorias,
        preguntasGuia: datos.preguntasGuia,
        requiereMatricula: datos.requiereMatricula,
        activa: datos.activa,
      },
    });
    return mapearCategoriaAVistaAdmin(categoria);
  }

  /** AD-04: sin filtro `activo` (D10): el moderador ve el catalogo completo de barrios, no solo los del piloto. */
  async listarBarriosAdmin(): Promise<BarrioAdminVista[]> {
    const barrios = await this.prisma.barrio.findMany({ orderBy: { nombre: "asc" } });
    return barrios.map(mapearBarrioAVistaAdmin);
  }

  /** AD-04/D10: activar o desactivar un barrio del piloto, sin migracion ni deploy. */
  async editarBarrio(id: string, datos: EditarBarrio): Promise<BarrioAdminVista> {
    const existente = await this.prisma.barrio.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El barrio no existe" });
    }

    const barrio = await this.prisma.barrio.update({
      where: { id },
      data: { activo: datos.activo },
    });
    return mapearBarrioAVistaAdmin(barrio);
  }
}
