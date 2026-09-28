import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CrearDenuncia,
  DenunciaModeracionPagina,
  DenunciaModeracionVista,
  ResolverDenunciaModeracion,
  TipoObjetoDenuncia,
} from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { recalcularPromedioResenias } from "../resenias/resenias.recalculo.js";

const TAMANIO_PAGINA = 20;

interface DenunciaBase {
  id: string;
  tipoObjeto: TipoObjetoDenuncia;
  objetoId: string;
  motivo: string;
  detalle: string | null;
  creadoEn: Date;
  reportante: { nombre: string | null; apellido: string | null };
}

/** `[nombre, apellido].filter(Boolean).join(" ")`, con fallback generico. Local a este archivo: no hace falta compartirlo. */
function nombreCompleto(nombre: string | null, apellido: string | null): string {
  return [nombre, apellido].filter(Boolean).join(" ") || "un usuario";
}

/** Recorta un texto a `maximo` caracteres para el resumen de la cola de moderacion, con "..." si lo corta. */
function truncar(texto: string, maximo: number): string {
  return texto.length > maximo ? `${texto.slice(0, maximo)}...` : texto;
}

/**
 * Canal de denuncia en perfil, pedido, postulacion y resenia (docs/dominio.md
 * §11/§15). PR-03 (slice 5) agrego "pedido"; CL-09 y PR-05/CL-08 (slice 6)
 * agregan "perfil" y "postulacion"; AD-02 (slice 9) agrega "resenia", cuyo
 * motivo tambien puede disparar el ocultamiento dinamico de la reseña
 * mientras se revisa (docs/dominio.md §8, ver ReseniasService.listarDeProfesional).
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

  /**
   * AD-02, tercera cola (D14): denuncias pendientes de perfil, postulacion o
   * resenia (las de pedido tienen su propia cola en PedidosModeracionService).
   * Mismo patron de paginacion por cursor que VerificacionesService.listarCola
   * / PedidosModeracionService.listarEnRevision.
   */
  async listarNoPedido(cursorId?: string): Promise<DenunciaModeracionPagina> {
    const denuncias = await this.prisma.denuncia.findMany({
      where: { estado: "pendiente", tipoObjeto: { in: ["perfil", "postulacion", "resenia"] } },
      include: { reportante: { select: { nombre: true, apellido: true } } },
      orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      take: TAMANIO_PAGINA + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hayMas = denuncias.length > TAMANIO_PAGINA;
    const pagina = hayMas ? denuncias.slice(0, TAMANIO_PAGINA) : denuncias;

    const items = await Promise.all(
      pagina.map((denuncia) => this.mapearAVistaModeracion(denuncia)),
    );

    return {
      items,
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * AD-02: resuelve una denuncia de perfil, postulacion o resenia (D14).
   * Descartar solo cierra la denuncia, sin ningun efecto sobre el objeto
   * (en resenia, si estaba oculta *dinamicamente* por esta denuncia, deja de
   * estarlo solo porque ya no queda ninguna denuncia "pendiente" con ese
   * motivo: ReseniasService.listarDeProfesional lo resuelve solo). Resolver
   * no aplica sancion automatica salvo en resenia, donde "resolver" significa
   * ocultarla definitivamente (D14): la cola enlaza al usuario en AD-03,
   * donde el moderador decide si suspende.
   *
   * En resenia, la accion se aplica a TODAS las denuncias pendientes de esa
   * misma reseña a la vez (no solo `denunciaId`): si hay dos denuncias
   * pendientes sobre la misma reseña y el moderador resuelve una sola,
   * "mantener" (descartar) tiene que volver a mostrarla sin que la otra
   * denuncia la siga ocultando, y "ocultar" (resolver) no puede dejar la otra
   * denuncia huerfana en la cola sin ningun efecto real.
   */
  async resolverNoPedido(
    moderadorId: string,
    denunciaId: string,
    datos: ResolverDenunciaModeracion,
  ): Promise<DenunciaModeracionVista> {
    const denuncia = await this.prisma.denuncia.findUnique({
      where: { id: denunciaId },
      include: { reportante: { select: { nombre: true, apellido: true } } },
    });
    if (!denuncia) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La denuncia no existe" });
    }

    const ahora = new Date();

    if (denuncia.tipoObjeto === "pedido") {
      // Estas se resuelven desde /admin/pedidos (PedidosModeracionService), no desde acá.
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "Las denuncias de pedido se resuelven desde la moderación de pedidos",
      });
    }

    if (denuncia.tipoObjeto !== "resenia") {
      // Perfil/postulacion: una fila, sin efecto sobre el objeto (D14:
      // "resolver no aplica sancion automatica"). updateMany condicional al
      // estado de origen como guarda de concurrencia (mismo patron que
      // transicionar()): si ya la resolvio otro moderador, count da 0 y se
      // informa conflicto en vez de pisar la resolucion ajena.
      const resultado = await this.prisma.denuncia.updateMany({
        where: { id: denunciaId, estado: "pendiente" },
        data: {
          estado: datos.accion === "descartar" ? "descartada" : "resuelta",
          resueltaEn: ahora,
        },
      });
      if (resultado.count === 0) {
        throw new ConflictException({
          codigo: "conflicto",
          mensaje: "Esta denuncia ya fue resuelta",
        });
      }
      return this.mapearAVistaModeracion(denuncia);
    }

    // Resenia (D14): la accion se aplica a TODAS las denuncias pendientes de
    // esa misma reseña a la vez (no solo `denunciaId`), para que "mantener"
    // la muestre de nuevo sin que otra denuncia grave la siga ocultando, y
    // "ocultar" no deje denuncias huerfanas en la cola sin ningun efecto.
    if (datos.accion === "descartar") {
      const resultado = await this.prisma.denuncia.updateMany({
        where: { tipoObjeto: "resenia", objetoId: denuncia.objetoId, estado: "pendiente" },
        data: { estado: "descartada", resueltaEn: ahora },
      });
      if (resultado.count === 0) {
        throw new ConflictException({
          codigo: "conflicto",
          mensaje: "Esta denuncia ya fue resuelta",
        });
      }
      return this.mapearAVistaModeracion(denuncia);
    }

    // accion === "resolver": oculta la resenia definitivamente (D14).
    await this.prisma.$transaction(async (tx) => {
      const resultado = await tx.denuncia.updateMany({
        where: { tipoObjeto: "resenia", objetoId: denuncia.objetoId, estado: "pendiente" },
        data: { estado: "resuelta", resueltaEn: ahora },
      });
      if (resultado.count === 0) {
        throw new ConflictException({
          codigo: "conflicto",
          mensaje: "Esta denuncia ya fue resuelta",
        });
      }
      const resenia = await tx.resenia.findUnique({
        where: { id: denuncia.objetoId },
        select: { profesionalId: true },
      });
      if (!resenia) {
        throw new NotFoundException({
          codigo: "no_encontrado",
          mensaje: "La reseña denunciada ya no existe",
        });
      }
      await tx.resenia.update({
        where: { id: denuncia.objetoId },
        data: { ocultaPorModeracionEn: ahora },
      });
      await recalcularPromedioResenias(tx, resenia.profesionalId);
    });

    return this.mapearAVistaModeracion(denuncia);
  }

  private async mapearAVistaModeracion(denuncia: DenunciaBase): Promise<DenunciaModeracionVista> {
    const { resumen, usuarioId } = await this.resolverContextoDenuncia(denuncia);
    return {
      id: denuncia.id,
      tipoObjeto: denuncia.tipoObjeto,
      motivo: denuncia.motivo,
      detalle: denuncia.detalle,
      creadoEn: denuncia.creadoEn.toISOString(),
      reportante: denuncia.reportante,
      resumen,
      usuarioId,
    };
  }

  /** D14: arma el resumen legible y el usuario al que enlaza AD-03, segun el tipo de objeto denunciado. */
  private async resolverContextoDenuncia(
    denuncia: Pick<DenunciaBase, "tipoObjeto" | "objetoId">,
  ): Promise<{ resumen: string; usuarioId: string | null }> {
    if (denuncia.tipoObjeto === "perfil") {
      const perfil = await this.prisma.perfilProfesional.findUnique({
        where: { id: denuncia.objetoId },
        include: { usuario: { select: { id: true, nombre: true, apellido: true } } },
      });
      if (!perfil) return { resumen: "Perfil ya no disponible", usuarioId: null };
      return {
        resumen: `Perfil de ${nombreCompleto(perfil.usuario.nombre, perfil.usuario.apellido)}`,
        usuarioId: perfil.usuario.id,
      };
    }

    if (denuncia.tipoObjeto === "postulacion") {
      const postulacion = await this.prisma.postulacion.findUnique({
        where: { id: denuncia.objetoId },
        include: {
          profesional: {
            include: { usuario: { select: { id: true, nombre: true, apellido: true } } },
          },
          pedido: { select: { descripcion: true } },
        },
      });
      if (!postulacion) return { resumen: "Postulación ya no disponible", usuarioId: null };
      const nombre = nombreCompleto(
        postulacion.profesional.usuario.nombre,
        postulacion.profesional.usuario.apellido,
      );
      const descripcion = truncar(postulacion.pedido.descripcion, 60);
      return {
        resumen: `Postulación de ${nombre} en "${descripcion}"`,
        usuarioId: postulacion.profesional.usuario.id,
      };
    }

    // "resenia": el resumen sigue mencionando al profesional reseñado (util
    // como contexto), pero usuarioId apunta al cliente que ESCRIBIO la
    // reseña, no al profesional que la recibio. Una denuncia de resenia
    // (datos personales, agresion) es sobre la conducta de quien la escribio,
    // asi que el link a AD-03 tiene que llevar a esa persona, no a la victima.
    const resenia = await this.prisma.resenia.findUnique({
      where: { id: denuncia.objetoId },
      include: {
        profesional: {
          include: { usuario: { select: { nombre: true, apellido: true } } },
        },
        cliente: { select: { id: true, nombre: true, apellido: true } },
      },
    });
    if (!resenia) return { resumen: "Reseña ya no disponible", usuarioId: null };
    const nombre = nombreCompleto(
      resenia.profesional.usuario.nombre,
      resenia.profesional.usuario.apellido,
    );
    return {
      resumen: `Reseña (${resenia.puntaje}★) a ${nombre}`,
      usuarioId: resenia.cliente.id,
    };
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

    // "resenia" (AD-02, slice 9, docs/dominio.md §8): mismo patron, 404 si no
    // existe. Cuando el motivo esta en MOTIVOS_DENUNCIA_RESENIA_QUE_OCULTAN no
    // hace falta ninguna escritura extra aca: el ocultamiento es dinamico (ver
    // ReseniasService.listarDeProfesional), no una columna que se setee al crear.
    const resenia = await this.prisma.resenia.findUnique({ where: { id: datos.objetoId } });
    if (!resenia) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La reseña no existe" });
    }
  }
}
