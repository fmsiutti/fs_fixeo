import type { BarrioVista, CategoriaVista } from "@fixeo/shared";
import type { Barrio, Categoria } from "../../generated/prisma/client.js";

export function mapearCategoriaAVista(categoria: Categoria): CategoriaVista {
  return {
    id: categoria.id,
    nombre: categoria.nombre,
    slug: categoria.slug,
    subcategorias: categoria.subcategorias,
    preguntasGuia: categoria.preguntasGuia,
    requiereMatricula: categoria.requiereMatricula,
  };
}

export function mapearBarrioAVista(barrio: Barrio): BarrioVista {
  return {
    id: barrio.id,
    nombre: barrio.nombre,
  };
}
