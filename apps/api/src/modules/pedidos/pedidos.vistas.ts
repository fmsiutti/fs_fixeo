import type { Franja, PedidoResumenVista, PedidoVista } from "@fixeo/shared";
import type {
  Barrio,
  Categoria,
  Direccion,
  FotoPedido,
  Pedido,
} from "../../generated/prisma/client.js";

const LARGO_RESUMEN_DESCRIPCION = 140;

export type PedidoConRelaciones = Pedido & {
  categoria: Categoria;
  direccion: Direccion;
  barrio: Barrio;
  fotos: FotoPedido[];
};

// CL-08 (revision de codigo del slice 6): igual que DatosDetalleFeed de
// pedidos.feed.vistas.ts, el mapeo de estos campos vive en el service (que es
// quien conoce los parametros de negocio via ParametrosService), no aca: esta
// funcion se mantiene pura y facil de testear sin mockear ParametrosService.
export interface DatosCupoPedido {
  postulacionesCupoLleno: boolean;
  cantidadContactos: number;
  seleccionablesLibres: number;
}

/**
 * Vista completa, solo para el dueno del pedido (CL-07). No hay todavia
 * ningun otro rol que vea un Pedido (el feed del profesional es el slice 5):
 * no ocultar nada aca no viola la regla de visibilidad de docs/dominio.md §7.
 */
export function mapearPedidoAVista(
  pedido: PedidoConRelaciones,
  datosCupo: DatosCupoPedido,
): PedidoVista {
  return {
    id: pedido.id,
    categoria: {
      id: pedido.categoria.id,
      nombre: pedido.categoria.nombre,
      slug: pedido.categoria.slug,
    },
    subcategoria: pedido.subcategoria,
    descripcion: pedido.descripcion,
    // Columna Json de Prisma: zod ya valida que las claves sean preguntas de
    // la categoria y los valores texto (respuestasGuiaSchema) al crear o
    // editar el pedido.
    respuestasGuia: pedido.respuestasGuia as Record<string, string> | null,
    urgencia: pedido.urgencia,
    // La columna es un text[] de Postgres (sin enum nativo); zod ya valida el
    // valor contra franjaSchema al crear el pedido, asi que siempre contiene
    // franjas validas.
    franjas: pedido.franjas as Franja[],
    direccion: {
      calle: pedido.direccion.calle,
      numero: pedido.direccion.numero,
      piso: pedido.direccion.piso,
      depto: pedido.direccion.depto,
      tipoPropiedad: pedido.direccion.tipoPropiedad,
      lat: pedido.direccion.lat,
      lng: pedido.direccion.lng,
    },
    barrio: {
      id: pedido.barrio.id,
      nombre: pedido.barrio.nombre,
    },
    estado: pedido.estado,
    publicadoEn: pedido.publicadoEn ? pedido.publicadoEn.toISOString() : null,
    expiraEn: pedido.expiraEn ? pedido.expiraEn.toISOString() : null,
    fotos: [...pedido.fotos]
      .sort((a, b) => a.orden - b.orden)
      .map((foto) => ({ id: foto.id, url: foto.url, orden: foto.orden })),
    vistas: pedido.vistas,
    cantidadPostulaciones: pedido.cantidadPostulaciones,
    postulacionesCupoLleno: datosCupo.postulacionesCupoLleno,
    cantidadContactos: datosCupo.cantidadContactos,
    seleccionablesLibres: datosCupo.seleccionablesLibres,
    creadoEn: pedido.creadoEn.toISOString(),
  };
}

export type PedidoConCategoriaResumen = Pedido & {
  categoria: Pick<Categoria, "nombre" | "slug">;
};

/** Version liviana para la lista de pedidos propios (CL-01): trunca la descripcion. */
export function mapearPedidoAResumenVista(pedido: PedidoConCategoriaResumen): PedidoResumenVista {
  return {
    id: pedido.id,
    categoria: { nombre: pedido.categoria.nombre, slug: pedido.categoria.slug },
    descripcion: truncar(pedido.descripcion, LARGO_RESUMEN_DESCRIPCION),
    estado: pedido.estado,
    urgencia: pedido.urgencia,
    creadoEn: pedido.creadoEn.toISOString(),
  };
}

function truncar(texto: string, largoMax: number): string {
  if (texto.length <= largoMax) return texto;
  return `${texto.slice(0, largoMax).trimEnd()}…`;
}
