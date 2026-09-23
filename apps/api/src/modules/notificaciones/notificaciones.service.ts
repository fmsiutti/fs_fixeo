import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

export interface DatosNotificacion {
  usuarioId: string;
  tipo: string;
  objetoId?: string | null;
}

/**
 * apps/api/CLAUDE.md: "toda notificacion se persiste en `notificacion`" y "la
 * deduplicacion de avisos usa una clave unica (tipo + objeto_id + usuario_id)".
 * Solo `crear()` por ahora: todavia no hay pantalla (CO-05) ni canal (push)
 * que lo consuma, eso es de un slice futuro.
 */
@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotente: si ya existe la misma (usuarioId, tipo, objetoId) no duplica
   * la fila. No usa `upsert` con la unique compuesta porque Prisma exige un
   * `objetoId` no nulo para esa clave (los tipos de notificacion sin objeto
   * asociado quedarian sin poder usarla).
   */
  async crear(datos: DatosNotificacion): Promise<void> {
    const objetoId = datos.objetoId ?? null;
    const yaExiste = await this.prisma.notificacion.findFirst({
      where: { usuarioId: datos.usuarioId, tipo: datos.tipo, objetoId },
      select: { id: true },
    });
    if (yaExiste) return;

    await this.prisma.notificacion.create({
      data: { usuarioId: datos.usuarioId, tipo: datos.tipo, objetoId },
    });
  }
}
