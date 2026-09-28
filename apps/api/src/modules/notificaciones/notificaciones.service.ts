import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  TEXTO_NOTIFICACION_GENERICO,
  TEXTOS_NOTIFICACION,
  type NotificacionPagina,
  type NotificacionVista,
  type SuscribirPush,
} from "@fixeo/shared";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  PROVEEDOR_WEB_PUSH,
  SuscripcionInvalidaError,
  type ProveedorWebPush,
} from "../../infra/webpush/proveedor-web-push.js";

export interface DatosNotificacion {
  usuarioId: string;
  tipo: string;
  objetoId?: string | null;
}

const TAMANIO_PAGINA = 20;

// Fix 2 (d), revision de codigo del slice 10: defensa en profundidad ademas
// del rate limit del endpoint, para que una cuenta no pueda acumular
// suscripciones push sin limite.
const MAXIMO_SUSCRIPCIONES_POR_USUARIO = 5;

/**
 * apps/api/CLAUDE.md: "toda notificacion se persiste en `notificacion`" y "la
 * deduplicacion de avisos usa una clave unica (tipo + objeto_id + usuario_id)".
 * `crear()`/`crearVarias()` ademas disparan el push (best-effort, nunca tumba
 * la accion de negocio); `listar()`/`marcarLeida()` alimentan CO-05.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROVEEDOR_WEB_PUSH) private readonly webPush: ProveedorWebPush,
  ) {}

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

    // Fix 2 (b), revision de codigo del slice 10: el push nunca tiene que
    // bloquear el flujo de negocio que disparo la notificacion (la fila ya
    // se creo). `enviarPushSeguro` esta protegido con try/catch adentro, asi
    // que dejar de esperarlo no cambia el resultado, solo evita que un
    // endpoint de push lento o colgado retrase el request real.
    void this.enviarPushSeguro(datos.usuarioId, datos.tipo, objetoId);
  }

  /**
   * Version en lote de `crear()`: un solo round-trip para avisar a muchos
   * usuarios (el job de matching notifica a ~30 profesionales) en vez de un
   * `crear()` por usuario en un loop. Fix 1, revision de codigo del slice 10:
   * los call sites reales NO comparten siempre el mismo `objetoId` (p. ej.
   * los barridos de jobs notifican un lote con un pedido distinto por
   * usuario), asi que el chequeo de "ya existe" tiene que ser por la tupla
   * completa (usuarioId, tipo, objetoId) de cada elemento, no solo la del
   * primero.
   */
  async crearVarias(datos: DatosNotificacion[]): Promise<void> {
    if (datos.length === 0) return;

    const existentes = await this.prisma.notificacion.findMany({
      where: {
        OR: datos.map((dato) => ({
          usuarioId: dato.usuarioId,
          tipo: dato.tipo,
          objetoId: dato.objetoId ?? null,
        })),
      },
      select: { usuarioId: true, tipo: true, objetoId: true },
    });
    const clavesExistentes = new Set(existentes.map((fila) => this.claveNotificacion(fila)));
    const nuevos = datos.filter((dato) => !clavesExistentes.has(this.claveNotificacion(dato)));
    if (nuevos.length === 0) return;

    await this.prisma.notificacion.createMany({
      data: nuevos.map((dato) => ({
        usuarioId: dato.usuarioId,
        tipo: dato.tipo,
        objetoId: dato.objetoId ?? null,
      })),
      skipDuplicates: true,
    });

    for (const dato of nuevos) {
      // Fix 2 (b): mismo criterio que en `crear()`, fire-and-forget.
      void this.enviarPushSeguro(dato.usuarioId, dato.tipo, dato.objetoId ?? null);
    }
  }

  private claveNotificacion(dato: {
    usuarioId: string;
    tipo: string;
    objetoId?: string | null;
  }): string {
    return `${dato.usuarioId}|${dato.tipo}|${dato.objetoId ?? ""}`;
  }

  /** CO-05: lista unificada, paginada por cursor. */
  async listar(usuarioId: string, cursorId?: string): Promise<NotificacionPagina> {
    const notificaciones = await this.prisma.notificacion.findMany({
      where: { usuarioId },
      orderBy: [{ creadaEn: "desc" }, { id: "desc" }],
      take: TAMANIO_PAGINA + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hayMas = notificaciones.length > TAMANIO_PAGINA;
    const pagina = hayMas ? notificaciones.slice(0, TAMANIO_PAGINA) : notificaciones;

    return {
      items: pagina.map((notificacion) => this.mapearAVista(notificacion)),
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  /** 404 uniforme: no revela si la notificacion existe pero es de otro usuario. */
  async marcarLeida(usuarioId: string, notificacionId: string): Promise<void> {
    const notificacion = await this.prisma.notificacion.findUnique({
      where: { id: notificacionId },
      select: { usuarioId: true },
    });
    if (!notificacion || notificacion.usuarioId !== usuarioId) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "La notificación no existe",
      });
    }

    await this.prisma.notificacion.update({
      where: { id: notificacionId },
      data: { leidaEn: new Date() },
    });
  }

  /**
   * Upsert por `endpoint` unico. El `update` reasigna `usuarioId` a
   * proposito: si dos cuentas comparten dispositivo/navegador (login
   * distinto sobre el mismo endpoint, mismas claves), la suscripcion tiene
   * que quedar del usuario que la pidio mas recientemente, no acumular
   * basura de la cuenta vieja.
   *
   * Fix 3, revision de codigo del slice 10: si el `endpoint` ya existe con
   * claves (`p256dh`/`auth`) DISTINTAS a las de este request, no es el mismo
   * navegador re-suscribiendose sino alguien mandando el endpoint de otra
   * cuenta (robo/reasignacion de suscripcion ajena) — se rechaza.
   *
   * Fix 2 (d): si el endpoint es nuevo para este usuario y ya tiene
   * `MAXIMO_SUSCRIPCIONES_POR_USUARIO` o mas, se borra la mas vieja antes de
   * crear la nueva (defensa en profundidad, ademas del rate limit del
   * endpoint).
   */
  async suscribirPush(usuarioId: string, datos: SuscribirPush): Promise<void> {
    const existente = await this.prisma.suscripcionPush.findUnique({
      where: { endpoint: datos.endpoint },
    });
    if (
      existente &&
      (existente.p256dh !== datos.keys.p256dh || existente.auth !== datos.keys.auth)
    ) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Esta suscripción ya está registrada",
      });
    }

    if (!existente) {
      const suscripcionesDelUsuario = await this.prisma.suscripcionPush.findMany({
        where: { usuarioId },
        orderBy: { creadaEn: "asc" },
        select: { id: true },
      });
      if (suscripcionesDelUsuario.length >= MAXIMO_SUSCRIPCIONES_POR_USUARIO) {
        const masVieja = suscripcionesDelUsuario[0];
        if (masVieja) {
          await this.prisma.suscripcionPush.delete({ where: { id: masVieja.id } });
        }
      }
    }

    await this.prisma.suscripcionPush.upsert({
      where: { endpoint: datos.endpoint },
      create: {
        usuarioId,
        endpoint: datos.endpoint,
        p256dh: datos.keys.p256dh,
        auth: datos.keys.auth,
      },
      update: {
        usuarioId,
        p256dh: datos.keys.p256dh,
        auth: datos.keys.auth,
      },
    });
  }

  /**
   * Mejor esfuerzo: si el endpoint no existe o es de otro usuario, no rompe
   * (es una limpieza que dispara el propio cliente al desuscribirse).
   */
  async desuscribirPush(usuarioId: string, endpoint: string): Promise<void> {
    await this.prisma.suscripcionPush.deleteMany({ where: { usuarioId, endpoint } });
  }

  private mapearAVista(notificacion: {
    id: string;
    tipo: string;
    objetoId: string | null;
    leidaEn: Date | null;
    creadaEn: Date;
  }): NotificacionVista {
    const texto = TEXTOS_NOTIFICACION[notificacion.tipo] ?? TEXTO_NOTIFICACION_GENERICO;
    return {
      id: notificacion.id,
      tipo: notificacion.tipo,
      objetoId: notificacion.objetoId,
      titulo: texto.titulo,
      cuerpo: texto.cuerpo,
      ruta: texto.ruta(notificacion.objetoId),
      leidaEn: notificacion.leidaEn ? notificacion.leidaEn.toISOString() : null,
      creadaEn: notificacion.creadaEn.toISOString(),
    };
  }

  /**
   * Nunca puede tumbar la accion de negocio ya resuelta (la fila de
   * `notificacion` ya se creo): una suscripcion muerta se borra, cualquier
   * otro error solo se loguea.
   */
  private async enviarPushSeguro(
    usuarioId: string,
    tipo: string,
    objetoId: string | null,
  ): Promise<void> {
    const suscripciones = await this.prisma.suscripcionPush.findMany({ where: { usuarioId } });
    if (suscripciones.length === 0) return;

    const texto = TEXTOS_NOTIFICACION[tipo] ?? TEXTO_NOTIFICACION_GENERICO;
    const payload = { titulo: texto.titulo, cuerpo: texto.cuerpo, ruta: texto.ruta(objetoId) };

    for (const suscripcion of suscripciones) {
      try {
        await this.webPush.enviar(
          {
            endpoint: suscripcion.endpoint,
            keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth },
          },
          payload,
        );
      } catch (error) {
        if (error instanceof SuscripcionInvalidaError) {
          await this.prisma.suscripcionPush
            .delete({ where: { id: suscripcion.id } })
            .catch(() => undefined); // ya pudo haberse borrado por otro request concurrente.
          continue;
        }
        this.logger.warn(`No se pudo enviar el push "${tipo}": ${String(error)}`);
      }
    }
  }
}
