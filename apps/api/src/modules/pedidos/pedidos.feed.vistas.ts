import type { PedidoFeedItemVista, PedidoVistaProfesional } from "@fixeo/shared";
import type {
  Barrio,
  Categoria,
  FotoPedido,
  Pedido,
  Usuario,
} from "../../generated/prisma/client.js";

export type PedidoFeedItemConRelaciones = Pedido & {
  categoria: Pick<Categoria, "nombre" | "slug">;
  barrio: Pick<Barrio, "id" | "nombre">;
  _count: { fotos: number };
};

/**
 * Revision de codigo del slice 5 (bloqueante 1): el centro de una zona tipo
 * "radio" lo controla el propio profesional sin cooldown (PUT
 * /perfil-profesional/zona). Devolver la distancia exacta al pedido permite
 * trilaterar la coordenada real del domicilio del cliente con 3
 * actualizaciones de zona + 3 lecturas de distanciaKm, exactamente el dato
 * que docs/dominio.md §7 reserva para el elegido. Redondear a la media
 * unidad es una medida de privacidad, no estetica: el valor sin redondear
 * sigue usandose tal cual puertas adentro (orden, distanciaMaxKm).
 */
function redondearDistanciaKm(distanciaKm: number | null): number | null {
  if (distanciaKm === null) return null;
  return Math.round(distanciaKm * 2) / 2;
}

/**
 * Tarjeta de PR-02 (docs/dominio.md §6): barrio, distancia, urgencia,
 * antiguedad, postulados. Sin ningun dato del cliente (ni el nombre de
 * pila): eso recien aparece en el detalle (PR-03).
 */
export function mapearPedidoAFeedItemVista(
  pedido: PedidoFeedItemConRelaciones,
  distanciaKm: number | null,
): PedidoFeedItemVista {
  return {
    id: pedido.id,
    categoria: { nombre: pedido.categoria.nombre, slug: pedido.categoria.slug },
    urgencia: pedido.urgencia,
    barrio: { id: pedido.barrio.id, nombre: pedido.barrio.nombre },
    distanciaKm: redondearDistanciaKm(distanciaKm),
    cantidadPostulaciones: pedido.cantidadPostulaciones,
    tieneFotos: pedido._count.fotos > 0,
    // D2/D3 (docs/dominio.md §12): sigue en el feed marcado asi mientras
    // quede cupo de elegibles; el service ya filtro los que no.
    yaEligioAlguien: pedido.estado === "contacto_habilitado",
    publicadoEn: pedido.publicadoEn ? pedido.publicadoEn.toISOString() : null,
    creadoEn: pedido.creadoEn.toISOString(),
  };
}

export type PedidoDetalleFeedConRelaciones = Pedido & {
  categoria: Categoria;
  barrio: Barrio;
  fotos: FotoPedido[];
  cliente: Pick<Usuario, "nombre">;
};

export interface DatosDetalleFeed {
  distanciaKm: number | null;
  postulacionesCupoLleno: boolean;
  yaEligioAlguien: boolean;
  seleccionablesLibres: number;
  verificacionAprobada: boolean;
}

/**
 * Detalle de PR-03 para el profesional (docs/dominio.md §7): nunca incluye
 * telefono, apellido ni direccion exacta del cliente, solo su nombre de pila.
 */
export function mapearPedidoAVistaProfesional(
  pedido: PedidoDetalleFeedConRelaciones,
  datos: DatosDetalleFeed,
): PedidoVistaProfesional {
  return {
    id: pedido.id,
    categoria: {
      id: pedido.categoria.id,
      nombre: pedido.categoria.nombre,
      slug: pedido.categoria.slug,
    },
    subcategoria: pedido.subcategoria,
    descripcion: pedido.descripcion,
    respuestasGuia: pedido.respuestasGuia as Record<string, string> | null,
    urgencia: pedido.urgencia,
    franjas: pedido.franjas as PedidoVistaProfesional["franjas"],
    barrio: { id: pedido.barrio.id, nombre: pedido.barrio.nombre },
    distanciaKm: redondearDistanciaKm(datos.distanciaKm),
    fotos: [...pedido.fotos]
      .sort((a, b) => a.orden - b.orden)
      .map((foto) => ({ id: foto.id, url: foto.url, orden: foto.orden })),
    estado: pedido.estado,
    cliente: { nombre: pedido.cliente.nombre },
    cantidadPostulaciones: pedido.cantidadPostulaciones,
    postulacionesCupoLleno: datos.postulacionesCupoLleno,
    yaEligioAlguien: datos.yaEligioAlguien,
    seleccionablesLibres: datos.seleccionablesLibres,
    verificacionAprobada: datos.verificacionAprobada,
    publicadoEn: pedido.publicadoEn ? pedido.publicadoEn.toISOString() : null,
    creadoEn: pedido.creadoEn.toISOString(),
  };
}
