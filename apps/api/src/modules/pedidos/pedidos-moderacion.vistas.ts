import type { PedidoModeracionVista } from "@fixeo/shared";
import type {
  Barrio,
  Categoria,
  FotoPedido,
  Pedido,
  Usuario,
} from "../../generated/prisma/client.js";

export type PedidoConRelacionesModeracion = Pedido & {
  cliente: Pick<Usuario, "nombre" | "apellido">;
  categoria: Categoria;
  barrio: Barrio;
  fotos: FotoPedido[];
};

/** Denuncia pendiente de tipo "pedido", tal cual sale de Prisma (sin mapear fechas). */
export interface DenunciaModeracionInput {
  id: string;
  motivo: string;
  detalle: string | null;
  creadoEn: Date;
}

/**
 * AD-02 (docs/dominio.md §3/§7, D1/D5): vista comun a las dos colas de
 * moderacion (en_revision y denunciados). `denuncias` solo lo completa
 * PedidosModeracionService.listarDenunciados; en_revision no tiene denuncias
 * asociadas y lo deja `undefined` (pedidoModeracionVistaSchema lo tiene
 * `.optional()`).
 */
export function mapearPedidoAModeracionVista(
  pedido: PedidoConRelacionesModeracion,
  denuncias?: DenunciaModeracionInput[],
): PedidoModeracionVista {
  return {
    id: pedido.id,
    cliente: {
      nombre: pedido.cliente.nombre,
      apellido: pedido.cliente.apellido,
    },
    categoria: {
      nombre: pedido.categoria.nombre,
      slug: pedido.categoria.slug,
    },
    descripcion: pedido.descripcion,
    urgencia: pedido.urgencia,
    barrio: {
      id: pedido.barrio.id,
      nombre: pedido.barrio.nombre,
    },
    estado: pedido.estado,
    motivoModeracion: pedido.motivoModeracion,
    fotos: [...pedido.fotos]
      .sort((a, b) => a.orden - b.orden)
      .map((foto) => ({ id: foto.id, url: foto.url, orden: foto.orden })),
    creadoEn: pedido.creadoEn.toISOString(),
    denuncias: denuncias?.map((denuncia) => ({
      id: denuncia.id,
      motivo: denuncia.motivo,
      detalle: denuncia.detalle,
      creadoEn: denuncia.creadoEn.toISOString(),
    })),
  };
}
