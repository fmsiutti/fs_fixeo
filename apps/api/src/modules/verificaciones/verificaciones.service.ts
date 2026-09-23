import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import sharp from "sharp";
import type {
  ResolverVerificacion,
  SubirDocumentoVerificacion,
  TipoVerificacion,
  VerificacionColaPagina,
  VerificacionVista,
} from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  PROVEEDOR_ALMACENAMIENTO_DOCUMENTOS,
  type ProveedorAlmacenamiento,
} from "../../infra/almacenamiento/proveedor-almacenamiento.js";
import { EventosService } from "../eventos/eventos.service.js";
import { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import { claveDocumentoVerificacion } from "./claves-verificacion.js";
import { mapearVerificacionAColaVista, mapearVerificacionAVista } from "./verificaciones.vistas.js";

const TTL_URL_FIRMADA_SEGUNDOS = 300;
const TAMANIO_PAGINA_COLA = 20;

const INCLUDE_COLA = {
  perfil: { include: { usuario: true } },
  oficio: { include: { categoria: true } },
} as const;

@Injectable()
export class VerificacionesService {
  private readonly logger = new Logger(VerificacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROVEEDOR_ALMACENAMIENTO_DOCUMENTOS)
    private readonly almacenamiento: ProveedorAlmacenamiento,
    private readonly eventos: EventosService,
    private readonly notificaciones: NotificacionesService,
    private readonly parametros: ParametrosService,
  ) {}

  async subirDocumento(
    usuarioId: string,
    archivo: Express.Multer.File,
    datos: SubirDocumentoVerificacion,
  ): Promise<VerificacionVista> {
    const perfil = await this.prisma.perfilProfesional.findUnique({ where: { usuarioId } });
    if (!perfil) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "Armá tu perfil profesional antes de subir documentos",
      });
    }

    let oficio = null;
    if (datos.tipo === "matricula") {
      oficio = await this.prisma.oficioProfesional.findFirst({
        where: { id: datos.oficioId, perfilId: perfil.id },
      });
      if (!oficio) {
        throw new NotFoundException({
          codigo: "no_encontrado",
          mensaje: "Ese oficio no pertenece a tu perfil",
        });
      }
    }

    const existente = await this.prisma.verificacion.findFirst({
      where: {
        perfilId: perfil.id,
        tipo: datos.tipo,
        oficioId: datos.oficioId ?? null,
        estado: "pendiente",
      },
    });
    const esNueva = !existente;
    const verificacionId = existente?.id ?? randomUUID();
    const cantidadDocumentos = existente?.documentos.length ?? 0;

    // Tope de documentos por verificacion (parametro, no constante hardcodeada:
    // CLAUDE.md #3). Se chequea antes de tocar el storage para no gastar una
    // subida si de entrada va a fallar.
    const topeDocumentos = await this.parametros.getNumero("documentos_verificacion_max");
    if (cantidadDocumentos >= topeDocumentos) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "Ya subiste el máximo de documentos para esta verificación",
      });
    }

    const { buffer, extension, contentType } = await this.procesarArchivo(archivo);
    const key = claveDocumentoVerificacion(perfil.id, verificacionId, extension);
    await this.almacenamiento.guardar(buffer, key, contentType);

    const verificacion = await this.prisma.$transaction(async (tx) => {
      const verificacionActualizada = existente
        ? await tx.verificacion.update({
            where: { id: existente.id },
            data: { documentos: { push: key } },
          })
        : await tx.verificacion.create({
            data: {
              id: verificacionId,
              perfilId: perfil.id,
              tipo: datos.tipo,
              oficioId: datos.oficioId ?? null,
              documentos: [key],
            },
          });

      if (datos.tipo === "matricula" && oficio) {
        await tx.oficioProfesional.update({
          where: { id: oficio.id },
          data: {
            matriculaNumero: datos.matriculaNumero,
            matriculaEnte: datos.matriculaEnte,
            matriculaVenceEn: datos.matriculaVenceEn,
            matriculaEstado: "pendiente",
          },
        });
      }

      return verificacionActualizada;
    });

    if (esNueva) {
      await this.registrarEventoSeguro({
        tipo: "verificacion_enviada",
        categoria: oficio ? await this.categoriaSlugDeOficio(oficio.categoriaId) : null,
        // Sin zona a proposito: una verificacion de identidad o de matricula
        // no tiene una zona natural (no es un pedido en un barrio), y un
        // profesional puede cubrir varios barrios a la vez. Forzar un valor
        // sintetico seria enganioso para la metrica.
        zona: null,
        rol: "profesional",
        usuarioId,
      });
    }

    return mapearVerificacionAVista(verificacion);
  }

  /**
   * AD-01: cola de verificaciones pendientes, paginada por cursor (id, orden
   * por enviadaEn asc). `rol` distingue moderador de soporte: soporte es
   * solo lectura de la cola (apps/api/CLAUDE.md "Auth") pero nunca de los
   * documentos en si (docs/dominio.md §13, "URLs firmadas... solo para
   * moderadores") asi que ni se firman ni se audita un acceso que no ocurrio.
   */
  async listarCola(
    moderadorId: string,
    rol: "moderador" | "soporte",
    cursorId?: string,
  ): Promise<VerificacionColaPagina> {
    const verificaciones = await this.prisma.verificacion.findMany({
      where: { estado: "pendiente" },
      include: INCLUDE_COLA,
      orderBy: [{ enviadaEn: "asc" }, { id: "asc" }],
      take: TAMANIO_PAGINA_COLA + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hayMas = verificaciones.length > TAMANIO_PAGINA_COLA;
    const pagina = hayMas ? verificaciones.slice(0, TAMANIO_PAGINA_COLA) : verificaciones;

    if (rol === "moderador" && pagina.length > 0) {
      // Cada listado de documentos (con su url firmada) cuenta como un
      // acceso auditado, una fila por verificacion vista (CLAUDE.md §"Archivos").
      await this.prisma.accesoDocumento.createMany({
        data: pagina.map((verificacion) => ({ verificacionId: verificacion.id, moderadorId })),
      });
    }

    const items = await Promise.all(
      pagina.map(async (verificacion) => {
        if (rol === "soporte") {
          return mapearVerificacionAColaVista(verificacion, []);
        }
        const documentosFirmados = await Promise.all(
          verificacion.documentos.map((key) =>
            this.almacenamiento.urlFirmada(key, TTL_URL_FIRMADA_SEGUNDOS),
          ),
        );
        return mapearVerificacionAColaVista(verificacion, documentosFirmados);
      }),
    );

    return {
      items,
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  /** AD-01: aprobar o rechazar, solo moderador. */
  async resolver(
    moderadorId: string,
    verificacionId: string,
    datos: ResolverVerificacion,
  ): Promise<VerificacionVista> {
    const verificacion = await this.prisma.verificacion.findUnique({
      where: { id: verificacionId },
    });
    if (!verificacion) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "La verificación no existe",
      });
    }

    const ahora = new Date();
    const dataVerificacion =
      datos.accion === "aprobar"
        ? { estado: "aprobada" as const, revisadaPor: moderadorId, revisadaEn: ahora }
        : {
            estado: "rechazada" as const,
            // No-null: resolverVerificacionSchema exige motivo cuando accion="rechazar" (refine).
            motivoRechazo: this.armarMotivoRechazo(datos.motivo!, datos.detalle),
            revisadaPor: moderadorId,
            revisadaEn: ahora,
          };

    const actualizada = await this.prisma.$transaction(async (tx) => {
      // updateMany condicional al estado de origen: guarda de concurrencia
      // sin SELECT ... FOR UPDATE aparte (mismo patron que pedidos.estados.ts).
      const resultado = await tx.verificacion.updateMany({
        where: { id: verificacionId, estado: "pendiente" },
        data: dataVerificacion,
      });
      if (resultado.count === 0) {
        throw new ConflictException({
          codigo: "conflicto",
          mensaje: "Esta verificación ya fue resuelta",
        });
      }

      if (verificacion.tipo === "identidad") {
        await tx.perfilProfesional.update({
          where: { id: verificacion.perfilId },
          data:
            datos.accion === "aprobar"
              ? { estadoVerificacion: "aprobada", verificadoEn: ahora }
              : { estadoVerificacion: "rechazada" },
        });
      } else if (verificacion.oficioId) {
        await tx.oficioProfesional.update({
          where: { id: verificacion.oficioId },
          data: { matriculaEstado: datos.accion === "aprobar" ? "validada" : "rechazada" },
        });
      }

      return tx.verificacion.findUniqueOrThrow({ where: { id: verificacionId } });
    });

    const perfil = await this.prisma.perfilProfesional.findUniqueOrThrow({
      where: { id: verificacion.perfilId },
    });
    await this.registrarEventoSeguro({
      tipo: "verificacion_resuelta",
      categoria: await this.categoriaSlugDeVerificacion(verificacion.tipo, verificacion.oficioId),
      // Mismo motivo que en verificacion_enviada: sin zona natural, no se inventa una.
      zona: null,
      rol: "moderador",
      usuarioId: moderadorId,
    });
    await this.notificaciones.crear({
      usuarioId: perfil.usuarioId,
      tipo: "verificacion_resuelta",
      objetoId: actualizada.id,
    });

    return mapearVerificacionAVista(actualizada);
  }

  private armarMotivoRechazo(
    motivo: NonNullable<ResolverVerificacion["motivo"]>,
    detalle: string | undefined,
  ): string {
    return detalle ? `${motivo}: ${detalle}` : motivo;
  }

  private async categoriaSlugDeOficio(categoriaId: string): Promise<string | null> {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id: categoriaId },
      select: { slug: true },
    });
    return categoria?.slug ?? null;
  }

  /** Igual que categoriaSlugDeOficio, pero partiendo del oficioId de una Verificacion de tipo matricula. */
  private async categoriaSlugDeVerificacion(
    tipo: TipoVerificacion,
    oficioId: string | null,
  ): Promise<string | null> {
    if (tipo !== "matricula" || !oficioId) return null;
    const oficio = await this.prisma.oficioProfesional.findUnique({
      where: { id: oficioId },
      select: { categoriaId: true },
    });
    if (!oficio) return null;
    return this.categoriaSlugDeOficio(oficio.categoriaId);
  }

  /** Mismo criterio que PedidosService: la analitica nunca tumba una accion de negocio ya resuelta. */
  private async registrarEventoSeguro(
    datos: Parameters<EventosService["registrar"]>[0],
  ): Promise<void> {
    try {
      await this.eventos.registrar(datos);
    } catch (error) {
      this.logger.warn(`No se pudo registrar el evento "${datos.tipo}": ${String(error)}`);
    }
  }

  /**
   * Documentos de verificacion: sin recodificar (son evidencia, no fotos de
   * pedido), pero si es imagen se pasa igual por sharp solo para quitar EXIF
   * (CLAUDE.md §9, "fotos sin metadatos de ubicacion" aplica a cualquier
   * imagen que suba un usuario). Un PDF se guarda tal cual.
   */
  private async procesarArchivo(
    archivo: Express.Multer.File,
  ): Promise<{ buffer: Buffer; extension: string; contentType: string }> {
    if (archivo.mimetype === "application/pdf") {
      return { buffer: archivo.buffer, extension: "pdf", contentType: "application/pdf" };
    }

    try {
      const buffer = await sharp(archivo.buffer).rotate().jpeg({ quality: 90 }).toBuffer();
      return { buffer, extension: "jpg", contentType: "image/jpeg" };
    } catch {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "La imagen no se pudo procesar",
      });
    }
  }
}
