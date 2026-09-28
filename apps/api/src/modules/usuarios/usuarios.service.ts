import { Injectable } from "@nestjs/common";
import type { ActualizarUsuario, CambiarRol, UsuarioVista } from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { mapearUsuarioAVista } from "./usuarios.vistas.js";

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  obtenerVista(usuario: Usuario): UsuarioVista {
    return mapearUsuarioAVista(usuario);
  }

  async actualizar(usuarioId: string, datos: ActualizarUsuario): Promise<UsuarioVista> {
    const usuario = await this.prisma.usuario.update({ where: { id: usuarioId }, data: datos });
    return mapearUsuarioAVista(usuario);
  }

  async cambiarRol(usuarioId: string, { rol }: CambiarRol): Promise<UsuarioVista> {
    const usuario = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { rolActivo: rol },
    });
    return mapearUsuarioAVista(usuario);
  }

  /** Soft delete: revoca sesiones y libera el telefono (unique) para que pueda volver a registrarse. */
  async eliminar(usuarioId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { usuarioId, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      // Soft delete, no borra la fila de Usuario (el cascade de la FK no
      // aplica): hay que limpiar las suscripciones push a mano.
      await tx.suscripcionPush.deleteMany({ where: { usuarioId } });
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { estado: "eliminado", telefono: `eliminado:${usuarioId}` },
      });
    });
  }
}
