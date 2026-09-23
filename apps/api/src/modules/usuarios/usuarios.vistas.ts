import type { UsuarioVista } from "@fixeo/shared";
import type { Usuario } from "../../generated/prisma/client.js";

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
