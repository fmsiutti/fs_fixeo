import type {
  NotaInternaVista,
  UsuarioBusquedaItemVista,
  UsuarioDetalleAdminVista,
  UsuarioVista,
} from "@fixeo/shared";
import type {
  EstadoPedido,
  EstadoVerificacion,
  NotaInterna,
  Usuario,
} from "../../generated/prisma/client.js";

/** Vista propia (GET/PATCH /usuarios/yo). No hay reglas de visibilidad de terceros en este slice. */
export function mapearUsuarioAVista(usuario: Usuario): UsuarioVista {
  return {
    id: usuario.id,
    telefono: usuario.telefono,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    fotoUrl: usuario.fotoUrl,
    rolActivo: usuario.rolActivo,
    estado: usuario.estado,
    creadoEn: usuario.creadoEn.toISOString(),
  };
}

/** AD-03: version liviana para la lista de resultados de busqueda. */
export function mapearUsuarioABusquedaVista(usuario: Usuario): UsuarioBusquedaItemVista {
  return {
    id: usuario.id,
    telefono: usuario.telefono,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    rolActivo: usuario.rolActivo,
    estado: usuario.estado,
    creadoEn: usuario.creadoEn.toISOString(),
  };
}

export type NotaInternaConAutor = NotaInterna & {
  autor: { nombre: string | null; apellido: string | null };
};

/** AD-03: nota interna, con el autor resuelto (nunca solo el id). */
export function mapearNotaInternaAVista(nota: NotaInternaConAutor): NotaInternaVista {
  return {
    id: nota.id,
    texto: nota.texto,
    autor: {
      nombre: nota.autor.nombre,
      apellido: nota.autor.apellido,
    },
    creadaEn: nota.creadaEn.toISOString(),
  };
}

export interface DatosDetalleAdminUsuario {
  notas: NotaInternaConAutor[];
  pedidos: { id: string; descripcion: string; estado: EstadoPedido; creadoEn: Date }[];
  perfilProfesional: {
    id: string;
    estadoVerificacion: EstadoVerificacion;
    pausado: boolean;
    cantidadResenias: number;
    promedioResenias: number | null;
    trabajosCerrados: number;
  } | null;
  denunciasHechas: number;
  denunciasRecibidas: number;
}

/** AD-03: detalle completo para el moderador/soporte (UsuariosAdminService.obtenerDetalle). */
export function mapearUsuarioADetalleAdminVista(
  usuario: Usuario,
  datos: DatosDetalleAdminUsuario,
): UsuarioDetalleAdminVista {
  return {
    ...mapearUsuarioAVista(usuario),
    notas: datos.notas.map(mapearNotaInternaAVista),
    pedidos: datos.pedidos.map((pedido) => ({
      id: pedido.id,
      descripcion: pedido.descripcion,
      estado: pedido.estado,
      creadoEn: pedido.creadoEn.toISOString(),
    })),
    perfilProfesional: datos.perfilProfesional,
    denunciasHechas: datos.denunciasHechas,
    denunciasRecibidas: datos.denunciasRecibidas,
  };
}
