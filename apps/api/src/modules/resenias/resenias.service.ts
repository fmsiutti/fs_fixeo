import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  MOTIVOS_DENUNCIA_RESENIA_QUE_OCULTAN,
  type ReseniaPagina,
  type ReseniaVista,
} from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { mapearReseniaAVista, type ReseniaConRelaciones } from "./resenias.vistas.js";

const TAMANIO_PAGINA = 20;

const INCLUDE_VISTA = {
  cliente: { select: { nombre: true, apellido: true } },
  pedido: { include: { categoria: true } },
} as const;

/** docs/dominio.md §8: reseñas, una por contacto, con una única respuesta pública del profesional. */
@Injectable()
export class ReseniasService {
  constructor(private readonly prisma: PrismaService) {}

  /** El profesional dueño de la reseña responde, una sola vez, públicamente. */
  async responder(usuarioId: string, reseniaId: string, respuesta: string): Promise<ReseniaVista> {
    const resenia = await this.prisma.resenia.findUnique({
      where: { id: reseniaId },
      include: { ...INCLUDE_VISTA, profesional: { select: { usuarioId: true } } },
    });
    // 404 uniforme: no revela si la reseña existe cuando no es del profesional.
    if (!resenia || resenia.profesional.usuarioId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La reseña no existe" });
    }
    if (resenia.respuestaProfesional) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Esta reseña ya tiene una respuesta",
      });
    }

    const actualizada = await this.prisma.resenia.update({
      where: { id: reseniaId },
      data: { respuestaProfesional: respuesta },
      include: INCLUDE_VISTA,
    });
    return mapearReseniaAVista(actualizada as ReseniaConRelaciones);
  }

  /**
   * CL-09/PR-07: reseñas públicas de un profesional, paginadas por cursor,
   * mas nuevas primero. Dos vias de ocultamiento (docs/dominio.md §8, D14):
   * dinamica mientras se revisa una denuncia pendiente por datos personales o
   * agresion (vuelve a aparecer sola si el moderador la descarta), y
   * permanente si el moderador la oculto definitivamente
   * (`ocultaPorModeracionEn`, ver DenunciasService.resolverNoPedido).
   */
  async listarDeProfesional(profesionalId: string, cursorId?: string): Promise<ReseniaPagina> {
    const perfil = await this.prisma.perfilProfesional.findUnique({
      where: { id: profesionalId },
      select: { id: true },
    });
    if (!perfil) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El profesional no existe" });
    }

    // docs/dominio.md §8: "se puede denunciar una reseña; se oculta mientras
    // se revisa solo si alega datos personales o agresion". Dinamico, sin
    // columna nueva: la reseña vuelve a aparecer sola en cuanto la denuncia
    // deje de estar "pendiente" (descartada por el moderador). Denuncia.objetoId
    // es polimorfico (sin FK hacia resenia), asi que no hay relacion Prisma
    // directa: se resuelve el conjunto de ids ocultos con una query aparte,
    // acotada a las reseñas de este profesional (si no tiene ninguna, ni
    // siquiera hace falta consultar denuncias).
    const idsReseniasDelProfesional = await this.prisma.resenia.findMany({
      where: { profesionalId },
      select: { id: true },
    });
    const idsResenias = idsReseniasDelProfesional.map((resenia) => resenia.id);

    const idsOcultos =
      idsResenias.length > 0
        ? (
            await this.prisma.denuncia.findMany({
              where: {
                tipoObjeto: "resenia",
                estado: "pendiente",
                motivo: { in: MOTIVOS_DENUNCIA_RESENIA_QUE_OCULTAN },
                objetoId: { in: idsResenias },
              },
              select: { objetoId: true },
            })
          ).map((denuncia) => denuncia.objetoId)
        : [];

    const resenias = await this.prisma.resenia.findMany({
      where: {
        profesionalId,
        // D14: ocultamiento permanente, decidido por el moderador.
        ocultaPorModeracionEn: null,
        // notIn: [] equivale a "sin filtro" en Prisma, pero se omite la
        // condicion cuando no hay nada oculto para no ensuciar el where.
        ...(idsOcultos.length > 0 ? { id: { notIn: idsOcultos } } : {}),
      },
      include: INCLUDE_VISTA,
      orderBy: [{ publicadaEn: "desc" }, { id: "desc" }],
      take: TAMANIO_PAGINA + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hayMas = resenias.length > TAMANIO_PAGINA;
    const pagina = hayMas ? resenias.slice(0, TAMANIO_PAGINA) : resenias;

    return {
      items: pagina.map((resenia) => mapearReseniaAVista(resenia as ReseniaConRelaciones)),
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }
}
