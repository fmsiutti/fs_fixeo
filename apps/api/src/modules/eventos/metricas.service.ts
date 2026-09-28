import { Injectable } from "@nestjs/common";
import type { MetricasCategoriaVista, MetricasQuery, MetricasTableroVista } from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

type MetricasSinRango = Omit<
  MetricasTableroVista,
  "rango" | "finalizacionAsistentePorcentaje" | "porCategoria"
>;

const DIAS_RANGO_DEFAULT = 30;
const DIA_MS = 24 * 60 * 60 * 1000;
const SEIS_HORAS_MS = 6 * 60 * 60 * 1000;

/**
 * AD-05 (docs/dominio.md §10): tablero de metricas. Caso de uso distinto de
 * EventosService (que solo escribe/registra): este solo lee y agrega, mismo
 * criterio de separacion que UsuariosAdminService/UsuariosService (CLAUDE.md
 * raiz, anti-sobreingenieria #8).
 */
@Injectable()
export class MetricasService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerTablero(query: MetricasQuery): Promise<MetricasTableroVista> {
    const hasta = query.hasta ?? new Date();
    const desde = query.desde ?? new Date(hasta.getTime() - DIAS_RANGO_DEFAULT * DIA_MS);
    const rango = { desde: desde.toISOString(), hasta: hasta.toISOString() };

    const [globales, finalizacionAsistentePorcentaje, porCategoria] = await Promise.all([
      this.calcularMetricas(desde, hasta, query.categoriaId, query.barrioId),
      this.calcularFinalizacionAsistente(desde, hasta, query),
      this.calcularPorCategoria(desde, hasta, query),
    ]);

    return { rango, ...globales, finalizacionAsistentePorcentaje, porCategoria };
  }

  /**
   * D16: mismas metricas del funnel que obtenerTablero, para un rango y un
   * filtro de categoria/zona dados. Extraida de obtenerTablero (segundo uso
   * real: tablero global y desglose por categoria, CLAUDE.md raiz,
   * anti-sobreingenieria #3) para no duplicar el calculo.
   */
  private async calcularMetricas(
    desde: Date,
    hasta: Date,
    categoriaId: string | undefined,
    barrioId: string | undefined,
  ): Promise<MetricasSinRango> {
    // Solo pedidos que llegaron al feed: los que nunca se publicaron
    // (en_revision sin resolver, bloqueado o cancelado antes de publicar) no
    // cuentan para el funnel (docs/dominio.md §10).
    const pedidos = await this.prisma.pedido.findMany({
      where: {
        publicadoEn: { gte: desde, lte: hasta },
        ...(categoriaId ? { categoriaId } : {}),
        ...(barrioId ? { barrioId } : {}),
      },
      select: {
        id: true,
        publicadoEn: true,
        cantidadPostulaciones: true,
        cantidadContactos: true,
        desenlace: true,
      },
    });

    const totalPedidosPublicados = pedidos.length;
    if (totalPedidosPublicados === 0) {
      return {
        totalPedidosPublicados: 0,
        coberturaSeisHorasPorcentaje: null,
        medianaMinutosPrimeraPostulacion: null,
        tasaContactoPorcentaje: null,
        tasaTrabajoDeclaradoPorcentaje: null,
        tasaSeleccionMedianaPorcentaje: null,
      };
    }

    const primeraPostulacionPorPedido = await this.obtenerPrimeraPostulacionPorPedido(
      pedidos.map((pedido) => pedido.id),
    );

    let conCoberturaSeisHoras = 0;
    const minutosPrimeraPostulacion: number[] = [];
    for (const pedido of pedidos) {
      const primera = primeraPostulacionPorPedido.get(pedido.id);
      if (!primera || !pedido.publicadoEn) continue;
      const diferenciaMs = primera.getTime() - pedido.publicadoEn.getTime();
      minutosPrimeraPostulacion.push(diferenciaMs / 60_000);
      if (diferenciaMs <= SEIS_HORAS_MS) conCoberturaSeisHoras++;
    }

    const conContacto = pedidos.filter((pedido) => pedido.cantidadContactos > 0).length;
    const conTrabajoDeclarado = pedidos.filter(
      (pedido) => pedido.desenlace === "lo_hizo_este_profesional",
    ).length;
    const tasasSeleccionPorPedido = pedidos
      .filter((pedido) => pedido.cantidadPostulaciones > 0)
      .map((pedido) => (pedido.cantidadContactos / pedido.cantidadPostulaciones) * 100);

    return {
      totalPedidosPublicados,
      coberturaSeisHorasPorcentaje: (conCoberturaSeisHoras / totalPedidosPublicados) * 100,
      medianaMinutosPrimeraPostulacion: mediana(minutosPrimeraPostulacion),
      tasaContactoPorcentaje: (conContacto / totalPedidosPublicados) * 100,
      tasaTrabajoDeclaradoPorcentaje: (conTrabajoDeclarado / totalPedidosPublicados) * 100,
      tasaSeleccionMedianaPorcentaje: mediana(tasasSeleccionPorPedido),
    };
  }

  /**
   * D16: desglose por categoria, mismo rango y misma zona que el tablero
   * global (nunca cruzado zona x categoria: "con los volumenes del piloto
   * las celdas quedarian sin muestra"). Si la query ya trae `categoriaId`,
   * da como mucho una fila, intencional.
   */
  private async calcularPorCategoria(
    desde: Date,
    hasta: Date,
    query: MetricasQuery,
  ): Promise<MetricasCategoriaVista[]> {
    const categorias = await this.prisma.categoria.findMany({
      where: { activa: true, ...(query.categoriaId ? { id: query.categoriaId } : {}) },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, slug: true },
    });

    return Promise.all(
      categorias.map(async (categoria) => {
        const metricas = await this.calcularMetricas(desde, hasta, categoria.id, query.barrioId);
        return { categoria, ...metricas };
      }),
    );
  }

  /** Primera postulacion de cada pedido (la mas vieja), para medir cobertura de 6 h y la mediana a la primera postulacion. */
  private async obtenerPrimeraPostulacionPorPedido(
    idsPedidos: string[],
  ): Promise<Map<string, Date>> {
    const postulaciones = await this.prisma.postulacion.findMany({
      where: { pedidoId: { in: idsPedidos } },
      select: { pedidoId: true, enviadaEn: true },
      orderBy: { enviadaEn: "asc" },
    });

    const primeraPorPedido = new Map<string, Date>();
    for (const postulacion of postulaciones) {
      if (!primeraPorPedido.has(postulacion.pedidoId)) {
        primeraPorPedido.set(postulacion.pedidoId, postulacion.enviadaEn);
      }
    }
    return primeraPorPedido;
  }

  /**
   * docs/dominio.md §10/§14 y D13: el asistente es anonimo/local hasta que se
   * crea el pedido, asi que no hay forma de linkear 1 a 1 un
   * `asistente_iniciado` con el `pedido_publicado` que origino. Aproximacion
   * deliberada: se comparan los conteos totales del rango (con el mismo
   * filtro de categoria/zona que el resto del tablero, si vino).
   */
  private async calcularFinalizacionAsistente(
    desde: Date,
    hasta: Date,
    query: MetricasQuery,
  ): Promise<number | null> {
    const [categoria, barrio] = await Promise.all([
      query.categoriaId
        ? this.prisma.categoria.findUnique({
            where: { id: query.categoriaId },
            select: { slug: true },
          })
        : null,
      query.barrioId
        ? this.prisma.barrio.findUnique({
            where: { id: query.barrioId },
            select: { nombre: true },
          })
        : null,
    ]);

    const filtroComun = {
      creadoEn: { gte: desde, lte: hasta },
      ...(categoria ? { categoria: categoria.slug } : {}),
      ...(barrio ? { zona: barrio.nombre } : {}),
    };

    const [iniciados, publicados] = await Promise.all([
      this.prisma.eventoAnalitico.count({ where: { tipo: "asistente_iniciado", ...filtroComun } }),
      this.prisma.eventoAnalitico.count({ where: { tipo: "pedido_publicado", ...filtroComun } }),
    ]);

    if (iniciados === 0) return null;
    return (publicados / iniciados) * 100;
  }
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 0) {
    return (ordenados[mitad - 1]! + ordenados[mitad]!) / 2;
  }
  return ordenados[mitad]!;
}
