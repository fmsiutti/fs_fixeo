import type { ReseniaVista } from "@fixeo/shared";
import type { Categoria, Pedido, Resenia, Usuario } from "../../generated/prisma/client.js";

export type ReseniaConRelaciones = Resenia & {
  cliente: Pick<Usuario, "nombre" | "apellido">;
  pedido: Pedido & { categoria: Categoria };
};

/**
 * CL-09/PR-07 (docs/dominio.md §8): "se publica con nombre de pila, inicial
 * del apellido, categoria y fecha". Nunca el apellido completo ni
 * `montoDeclarado` (privado, "solo alimenta rangos de referencia").
 */
export function mapearReseniaAVista(resenia: ReseniaConRelaciones): ReseniaVista {
  return {
    id: resenia.id,
    cliente: {
      nombre: resenia.cliente.nombre,
      inicialApellido: resenia.cliente.apellido ? `${resenia.cliente.apellido.charAt(0)}.` : null,
    },
    categoria: {
      nombre: resenia.pedido.categoria.nombre,
      slug: resenia.pedido.categoria.slug,
    },
    puntaje: resenia.puntaje,
    atributos: resenia.atributos,
    comentario: resenia.comentario,
    respuestaProfesional: resenia.respuestaProfesional,
    publicadaEn: resenia.publicadaEn.toISOString(),
  };
}
