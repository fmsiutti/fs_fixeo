import type {
  EstimacionPostulacionInput,
  PostulacionVistaCliente,
  PostulacionVistaProfesional,
} from "@fixeo/shared";
import type {
  Categoria,
  Pedido,
  PerfilProfesional,
  Postulacion,
  Usuario,
} from "../../generated/prisma/client.js";

export type PedidoConCategoria = Pedido & { categoria: Categoria };

/**
 * PR-05: vista del profesional sobre su propia postulacion. Nunca incluye
 * datos del cliente (docs/dominio.md §7: antes de la seleccion el cliente es
 * practicamente anonimo para el profesional).
 */
export function mapearPostulacionAVistaProfesional(
  postulacion: Postulacion,
  pedido: PedidoConCategoria,
  opciones: { otroYaElegido: boolean },
): PostulacionVistaProfesional {
  return {
    id: postulacion.id,
    pedido: {
      id: pedido.id,
      categoria: { nombre: pedido.categoria.nombre, slug: pedido.categoria.slug },
      descripcion: pedido.descripcion,
      estado: pedido.estado,
    },
    mensaje: postulacion.mensaje,
    estimacion: mapearEstimacion(postulacion),
    disponibilidad: postulacion.disponibilidad,
    estado: postulacion.estado,
    otroYaElegido: opciones.otroYaElegido,
    enviadaEn: postulacion.enviadaEn.toISOString(),
    vistaEn: postulacion.vistaEn ? postulacion.vistaEn.toISOString() : null,
  };
}

export type PostulacionConProfesional = Postulacion & {
  profesional: PerfilProfesional & { usuario: Pick<Usuario, "nombre" | "apellido" | "fotoUrl"> };
};

/**
 * CL-08: vista del cliente sobre las postulaciones de su propio pedido. El
 * profesional se ve siempre completo (docs/dominio.md §7: "Nombre y perfil
 * del profesional | Completo | Completo"); el telefono no esta en este
 * schema, ese es el unico dato que sigue oculto antes de elegir.
 */
export function mapearPostulacionAVistaCliente(
  postulacion: PostulacionConProfesional,
  opciones: { ahoraMs: number; descarteReversibleHoras: number },
): PostulacionVistaCliente {
  const puedeDescartar = postulacion.estado === "enviada" || postulacion.estado === "vista";
  const ventanaMs = opciones.descarteReversibleHoras * 60 * 60 * 1000;
  const puedeRevertirDescarte =
    postulacion.estado === "descartada" &&
    postulacion.descartadaEn !== null &&
    opciones.ahoraMs - postulacion.descartadaEn.getTime() <= ventanaMs;

  return {
    id: postulacion.id,
    profesional: {
      id: postulacion.profesionalId,
      nombre: postulacion.profesional.usuario.nombre,
      apellido: postulacion.profesional.usuario.apellido,
      fotoUrl: postulacion.profesional.usuario.fotoUrl,
      promedioResenias: postulacion.profesional.promedioResenias,
      cantidadResenias: postulacion.profesional.cantidadResenias,
      aniosExperiencia: postulacion.profesional.aniosExperiencia,
    },
    mensaje: postulacion.mensaje,
    estimacion: mapearEstimacion(postulacion),
    disponibilidad: postulacion.disponibilidad,
    estado: postulacion.estado,
    puedeDescartar,
    puedeRevertirDescarte,
    enviadaEn: postulacion.enviadaEn.toISOString(),
  };
}

function mapearEstimacion(postulacion: Postulacion): EstimacionPostulacionInput {
  if (postulacion.estimacionADefinir) return { aDefinir: true };
  // No nulos en la practica: crear() siempre escribe min/max juntos cuando
  // aDefinir es false (postulaciones.service.ts).
  return {
    aDefinir: false,
    minimo: postulacion.estimacionMin ?? 0,
    maximo: postulacion.estimacionMax ?? 0,
  };
}
