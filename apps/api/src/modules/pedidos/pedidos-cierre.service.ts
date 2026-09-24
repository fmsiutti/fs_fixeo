import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { CerrarPedido, EstadoPedido, PedidoVista } from "@fixeo/shared";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { EventosService } from "../eventos/eventos.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import { caducarPostulacionesAbiertas } from "../postulaciones/postulaciones.estados.js";
import { transicionar } from "./pedidos.estados.js";
import { mapearPedidoAVista } from "./pedidos.vistas.js";
import type { PedidoConRelaciones } from "./pedidos.vistas.js";

const INCLUDE_VISTA_COMPLETA = {
  categoria: true,
  direccion: true,
  barrio: true,
  fotos: true,
} as const;

const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * CL-11 (docs/dominio.md §3, §8, §12 D4): cerrar el pedido declarando su
 * desenlace, con la reseña opcional atada al mismo cierre. Aparte de
 * PedidosService (CLAUDE.md raiz, anti-sobreingenieria #8: un service que
 * pasa de ~400 lineas se divide por caso de uso, no por capa tecnica) porque
 * es un caso de uso autocontenido, mismo criterio que ya separa
 * PedidosFeedService.
 */
@Injectable()
export class PedidosCierreService {
  private readonly logger = new Logger(PedidosCierreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    private readonly eventos: EventosService,
  ) {}

  /**
   * CL-11: el cliente declara el desenlace del pedido. "todavia_no_lo_resolvi"
   * (D4, docs/dominio.md §12) no cierra el pedido, va por su propio camino
   * (postergarDesenlace); los otros 3 desenlaces cierran via transicionar().
   */
  async cerrar(usuarioId: string, pedidoId: string, datos: CerrarPedido): Promise<PedidoVista> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { categoria: true, barrio: true },
    });
    if (!pedido || pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }
    if (pedido.estado !== "contacto_habilitado") {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este pedido no se puede cerrar todavía",
      });
    }

    if (datos.desenlace === "todavia_no_lo_resolvi") {
      return this.postergarDesenlace(pedido);
    }

    // Se resuelven dentro de la transaccion (solo si desenlace ===
    // "lo_hizo_este_profesional") para decidir, ya afuera, que eventos
    // registrar sin tener que volver a tocar la base.
    let seCreoResenia = false;

    await this.prisma.$transaction(async (tx) => {
      await transicionar(tx, pedidoId, "contacto_habilitado", "cerrado", {
        desenlace: datos.desenlace,
      });

      // docs/dominio.md §4 (tabla D2), tercera fila: cerrar/expirar/cancelar/
      // bloquear el pedido caduca las postulaciones que seguian `enviada`/
      // `vista` (D2: no elegidas que quedaban vivas mientras hubiera cupo).
      // Sin aviso al profesional, igual que el resto de las transiciones que
      // disparan esto (solo `cancelado` avisa).
      await caducarPostulacionesAbiertas(tx, pedidoId);

      if (datos.desenlace !== "lo_hizo_este_profesional") return;

      // El schema (cerrarPedidoSchema.superRefine) ya exige contactoId para
      // este desenlace; este chequeo es defensa en profundidad, no el
      // control principal.
      if (!datos.contactoId) {
        throw new BadRequestException({
          codigo: "validacion",
          mensaje: "Falta indicar cuál de los elegidos hizo el trabajo",
        });
      }

      const contacto = await tx.contacto.findUnique({
        where: { id: datos.contactoId },
        include: { postulacion: { select: { profesionalId: true } } },
      });
      if (!contacto || contacto.pedidoId !== pedidoId) {
        throw new BadRequestException({
          codigo: "validacion",
          mensaje: "Ese contacto no corresponde a este pedido",
        });
      }

      const profesionalId = contacto.postulacion.profesionalId;

      // "Lo hizo este profesional" ya cuenta como trabajo cerrado, con o sin
      // resenia (consigna del slice).
      await tx.perfilProfesional.update({
        where: { id: profesionalId },
        data: { trabajosCerrados: { increment: 1 } },
      });

      if (!datos.resenia) return;

      try {
        await tx.resenia.create({
          data: {
            pedidoId,
            contactoId: contacto.id,
            profesionalId,
            clienteId: usuarioId,
            puntaje: datos.resenia.puntaje,
            atributos: datos.resenia.atributos,
            comentario: datos.resenia.comentario ?? null,
            montoDeclarado: datos.resenia.montoDeclarado ?? null,
          },
        });
      } catch (error) {
        // El @@unique de contactoId es la defensa de ultima linea contra una
        // doble resenia del mismo contacto (docs/dominio.md §8, "una por
        // contacto"); mismo patron de catch de P2002 que verificarFotos.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException({
            codigo: "conflicto",
            mensaje: "Este contacto ya tiene una reseña",
          });
        }
        throw error;
      }

      // Volumen bajo (piloto): recalcular con avg()/count() sobre la tabla es
      // mas simple y mas dificil de desincronizar que llevar la cuenta a mano.
      const agregado = await tx.resenia.aggregate({
        where: { profesionalId },
        _avg: { puntaje: true },
        _count: { _all: true },
      });
      await tx.perfilProfesional.update({
        where: { id: profesionalId },
        data: {
          promedioResenias: agregado._avg.puntaje,
          cantidadResenias: agregado._count._all,
        },
      });

      seCreoResenia = true;
    });

    await this.registrarEventoSeguro({
      tipo: "pedido_cerrado",
      categoria: pedido.categoria.slug,
      zona: pedido.barrio.nombre,
      rol: "cliente",
      usuarioId,
      pedidoId,
    });
    if (seCreoResenia) {
      await this.registrarEventoSeguro({
        tipo: "resenia_publicada",
        categoria: pedido.categoria.slug,
        zona: pedido.barrio.nombre,
        rol: "cliente",
        usuarioId,
        pedidoId,
      });
    }

    const actualizado = await this.prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: INCLUDE_VISTA_COMPLETA,
    });
    return this.mapearAVistaConCupo(actualizado);
  }

  /**
   * D4 (docs/dominio.md §12): "todavia no lo resolvi" no cierra, corre
   * cierre_automatico_en desde la fecha que ya tenia (no desde "ahora") y
   * marca desenlace_postergado, que solo puede pasar una vez. Sin
   * transicion de estado: el `updateMany` condicional al estado Y a
   * desenlacePostergado=false es la misma guarda de concurrencia que usa
   * transicionar(), pero sobre un campo que no es el estado.
   */
  private async postergarDesenlace(pedido: {
    id: string;
    estado: EstadoPedido;
    desenlacePostergado: boolean;
    cierreAutomaticoEn: Date | null;
  }): Promise<PedidoVista> {
    if (pedido.desenlacePostergado) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este pedido ya postergó el desenlace una vez",
      });
    }

    const postergacionDias = await this.parametros.getNumero("postergacion_desenlace_dias");
    // cierreAutomaticoEn siempre tiene valor en contacto_habilitado (lo fija
    // la primera seleccion), pero por si acaso se cae a "ahora" en vez de
    // romper.
    const cierreActual = pedido.cierreAutomaticoEn ?? new Date();
    const nuevoCierre = new Date(cierreActual.getTime() + postergacionDias * MILISEGUNDOS_POR_DIA);

    const resultado = await this.prisma.pedido.updateMany({
      where: { id: pedido.id, estado: "contacto_habilitado", desenlacePostergado: false },
      data: { cierreAutomaticoEn: nuevoCierre, desenlacePostergado: true },
    });
    if (resultado.count === 0) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este pedido ya no se puede postergar",
      });
    }

    const actualizado = await this.prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.id },
      include: INCLUDE_VISTA_COMPLETA,
    });
    return this.mapearAVistaConCupo(actualizado);
  }

  /**
   * CL-07/CL-08 (revision de codigo del slice 6): mismo calculo de cupo que
   * PedidosService.mapearAVistaConCupo, duplicado a proposito (mismo criterio
   * que ya usa PedidosFeedService con sus propios includes y su propio
   * registrarEventoSeguro): cada service del modulo es autocontenido, sin
   * depender uno de otro.
   */
  private async mapearAVistaConCupo(pedido: PedidoConRelaciones): Promise<PedidoVista> {
    const [seleccionablesMax, postulacionesMax] = await Promise.all([
      this.parametros.getNumero("seleccionables_max_por_pedido"),
      this.parametros.getNumero("postulaciones_max_por_pedido"),
    ]);
    return mapearPedidoAVista(pedido, {
      postulacionesCupoLleno: pedido.cantidadPostulaciones >= postulacionesMax,
      cantidadContactos: pedido.cantidadContactos,
      seleccionablesLibres: Math.max(0, seleccionablesMax - pedido.cantidadContactos),
    });
  }

  /** La analitica nunca puede tumbar una accion de negocio ya resuelta (mismo criterio que PedidosService). */
  private async registrarEventoSeguro(
    datos: Parameters<EventosService["registrar"]>[0],
  ): Promise<void> {
    try {
      await this.eventos.registrar(datos);
    } catch (error) {
      this.logger.warn(`No se pudo registrar el evento "${datos.tipo}": ${String(error)}`);
    }
  }
}
