import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CrearDenuncia } from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

/**
 * Canal de denuncia en perfil, pedido y postulacion (docs/dominio.md §11/§15).
 * PR-03 (slice 5) agrego "pedido"; CL-09 y PR-05/CL-08 (slice 6) agregan
 * "perfil" y "postulacion". "resenia" todavia no tiene pantalla (slice 8), asi
 * que sigue rechazada explicitamente (revision de codigo del slice 5: antes
 * se insertaban sin ningun chequeo de existencia).
 */
@Injectable()
export class DenunciasService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(reportanteId: string, datos: CrearDenuncia): Promise<{ id: string }> {
    await this.validarQueElObjetoExista(datos);

    // Mismo patron que NotificacionesService.crear: sin unique constraint en
    // la tabla, un `findFirst` previo alcanza para no acumular denuncias
    // repetidas del mismo reportante contra el mismo objeto (revision de
    // codigo del slice 5: antes cualquier usuario podia denunciar el mismo
    // objeto una cantidad ilimitada de veces).
    const yaExiste = await this.prisma.denuncia.findFirst({
      where: { reportanteId, tipoObjeto: datos.tipoObjeto, objetoId: datos.objetoId },
      select: { id: true },
    });
    if (yaExiste) return yaExiste;

    const denuncia = await this.prisma.denuncia.create({
      data: {
        reportanteId,
        tipoObjeto: datos.tipoObjeto,
        objetoId: datos.objetoId,
        motivo: datos.motivo,
        detalle: datos.detalle ?? null,
      },
      select: { id: true },
    });

    return denuncia;
  }

  private async validarQueElObjetoExista(datos: CrearDenuncia): Promise<void> {
    if (datos.tipoObjeto === "pedido") {
      const pedido = await this.prisma.pedido.findUnique({ where: { id: datos.objetoId } });
      if (!pedido) {
        throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
      }
      return;
    }

    if (datos.tipoObjeto === "perfil") {
      const perfil = await this.prisma.perfilProfesional.findUnique({
        where: { id: datos.objetoId },
      });
      if (!perfil) {
        throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El perfil no existe" });
      }
      return;
    }

    if (datos.tipoObjeto === "postulacion") {
      const postulacion = await this.prisma.postulacion.findUnique({
        where: { id: datos.objetoId },
      });
      if (!postulacion) {
        throw new NotFoundException({
          codigo: "no_encontrado",
          mensaje: "La postulación no existe",
        });
      }
      return;
    }

    // "resenia": todavia no tiene pantalla (slice 8), no hay de donde salir.
    throw new BadRequestException({
      codigo: "validacion",
      mensaje: "Este tipo de denuncia todavía no está disponible",
    });
  }
}
