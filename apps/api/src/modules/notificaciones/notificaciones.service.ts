import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

export interface DatosNotificacion {
  usuarioId: string;
  tipo: string;
  objetoId?: string | null;
}

/**
 * apps/api/CLAUDE.md: "toda notificacion se persiste en `notificacion`" y "la
 * deduplicacion de avisos usa una clave unica (tipo + objeto_id + usuario_id)".
 * Solo `crear()`/`crearVarias()` por ahora: todavia no hay pantalla (CO-05)
 * ni canal (push) que lo consuma, eso es de un slice futuro.
 */
@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotente: si ya existe la misma (usuarioId, tipo, objetoId) no duplica
   * la fila. No usa `upsert` con la unique compuesta porque Prisma exige un
   * `objetoId` no nulo para esa clave (los tipos de notificacion sin objeto
   * asociado quedarian sin poder usarla).
   *
   * El `findFirst` previo no es atomico: dos ejecuciones concurrentes (p. ej.
   * un reproceso de BullMQ) pueden pasar el chequeo las dos y competir por la
   * unique constraint (revision de codigo del slice 5). El catch de abajo
   * ignora especificamente ese choque, con el mismo patron que ya usa
   * PedidosService para el P2002 de foto_pedido.
   */
  async crear(datos: DatosNotificacion): Promise<void> {
    const objetoId = datos.objetoId ?? null;
    const yaExiste = await this.prisma.notificacion.findFirst({
      where: { usuarioId: datos.usuarioId, tipo: datos.tipo, objetoId },
      select: { id: true },
    });
    if (yaExiste) return;

    try {
      await this.prisma.notificacion.create({
        data: { usuarioId: datos.usuarioId, tipo: datos.tipo, objetoId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }
  }

  /**
   * Version en lote de `crear()`: un solo round-trip para avisar a muchos
   * usuarios (el job de matching notifica a ~30 profesionales) en vez de un
   * `crear()` por usuario en un loop. `skipDuplicates` cubre tanto la
   * deduplicacion normal como la carrera entre reprocesos concurrentes.
   */
  async crearVarias(datos: DatosNotificacion[]): Promise<void> {
    if (datos.length === 0) return;

    await this.prisma.notificacion.createMany({
      data: datos.map((dato) => ({
        usuarioId: dato.usuarioId,
        tipo: dato.tipo,
        objetoId: dato.objetoId ?? null,
      })),
      skipDuplicates: true,
    });
  }
}
