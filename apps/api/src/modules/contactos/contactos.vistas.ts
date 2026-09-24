import type {
  ContactoVistaCliente,
  ContactoVistaProfesional,
  EstimacionPostulacionInput,
  Franja,
} from "@fixeo/shared";
import type {
  Barrio,
  Categoria,
  Contacto,
  Direccion,
  PerfilProfesional,
  Pedido,
  Postulacion,
  Usuario,
} from "../../generated/prisma/client.js";

export type ContactoConProfesional = Contacto & {
  postulacion: Postulacion & {
    profesional: PerfilProfesional & {
      usuario: Pick<Usuario, "nombre" | "apellido" | "fotoUrl" | "telefono">;
    };
  };
};

/**
 * CL-10: un bloque por profesional elegido. A diferencia de
 * mapearPostulacionAVistaCliente (postulaciones.vistas.ts), este si incluye
 * el telefono del profesional (docs/dominio.md §7: solo se revela al
 * cliente que lo elige, y este mapeo solo se llama sobre Contactos ya
 * creados).
 */
export function mapearContactoAVistaCliente(
  contacto: ContactoConProfesional,
): ContactoVistaCliente {
  const { postulacion } = contacto;
  return {
    id: contacto.id,
    // El front la necesita para POST /postulaciones/:id/evento-contacto
    // (whatsapp_abierto / llamada_iniciada), que cuelga de la Postulacion.
    postulacionId: contacto.postulacionId,
    orden: contacto.orden,
    profesional: {
      id: postulacion.profesionalId,
      nombre: postulacion.profesional.usuario.nombre,
      apellido: postulacion.profesional.usuario.apellido,
      fotoUrl: postulacion.profesional.usuario.fotoUrl,
      telefono: postulacion.profesional.usuario.telefono,
      promedioResenias: postulacion.profesional.promedioResenias,
      cantidadResenias: postulacion.profesional.cantidadResenias,
      aniosExperiencia: postulacion.profesional.aniosExperiencia,
    },
    mensaje: postulacion.mensaje,
    estimacion: mapearEstimacion(postulacion),
    estadoPostulacion: postulacion.estado,
    habilitadoEn: contacto.habilitadoEn.toISOString(),
  };
}

export type ContactoConPedidoYCliente = Contacto & {
  pedido: Pedido & {
    categoria: Categoria;
    direccion: Direccion;
    barrio: Barrio;
    cliente: Pick<Usuario, "nombre" | "apellido" | "telefono">;
  };
  postulacion: Pick<Postulacion, "estado">;
};

/**
 * PR-06: lo que ve el profesional elegido. `hayOtrosElegidos` llega resuelto
 * por el service (compara `pedido.cantidadContactos > 1`): esta funcion se
 * mantiene pura, sin volver a mirar la entidad para decidirlo (mismo
 * criterio que `DatosCupoPedido` en pedidos.vistas.ts).
 */
export function mapearContactoAVistaProfesional(
  contacto: ContactoConPedidoYCliente,
  opciones: { hayOtrosElegidos: boolean },
): ContactoVistaProfesional {
  const { pedido } = contacto;
  return {
    id: contacto.id,
    pedido: {
      id: pedido.id,
      categoria: { nombre: pedido.categoria.nombre, slug: pedido.categoria.slug },
      descripcion: pedido.descripcion,
      urgencia: pedido.urgencia,
      franjas: pedido.franjas as Franja[],
    },
    cliente: {
      nombre: pedido.cliente.nombre,
      apellido: pedido.cliente.apellido,
      telefono: pedido.cliente.telefono,
      direccion: {
        calle: pedido.direccion.calle,
        numero: pedido.direccion.numero,
        piso: pedido.direccion.piso,
        depto: pedido.direccion.depto,
        lat: pedido.direccion.lat,
        lng: pedido.direccion.lng,
      },
      barrio: { nombre: pedido.barrio.nombre },
    },
    hayOtrosElegidos: opciones.hayOtrosElegidos,
    estadoPostulacion: contacto.postulacion.estado,
    habilitadoEn: contacto.habilitadoEn.toISOString(),
  };
}

function mapearEstimacion(postulacion: Postulacion): EstimacionPostulacionInput {
  if (postulacion.estimacionADefinir) return { aDefinir: true };
  // No nulos en la practica: PostulacionesService.crear siempre escribe
  // min/max juntos cuando aDefinir es false.
  return {
    aDefinir: false,
    minimo: postulacion.estimacionMin ?? 0,
    maximo: postulacion.estimacionMax ?? 0,
  };
}
