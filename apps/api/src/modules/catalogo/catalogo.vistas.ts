import type {
  BarrioAdminVista,
  BarrioVista,
  CategoriaAdminVista,
  CategoriaVista,
} from "@fixeo/shared";
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

/** AD-04: igual que mapearCategoriaAVista, mas `activa` (el moderador la necesita para gestionar el catalogo). */
export function mapearCategoriaAVistaAdmin(categoria: Categoria): CategoriaAdminVista {
  return { ...mapearCategoriaAVista(categoria), activa: categoria.activa };
}

/** AD-04/D10: igual que mapearBarrioAVista, mas `activo`. */
export function mapearBarrioAVistaAdmin(barrio: Barrio): BarrioAdminVista {
  return { ...mapearBarrioAVista(barrio), activo: barrio.activo };
}
