import { Injectable } from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";

/** Fila cruda de la consulta geoespacial: un candidato por perfil profesional. */
export interface CandidatoMatching {
  usuarioId: string;
  cantidadResenias: number;
  promedioResenias: number | null;
  tasaRespuesta: number | null;
  // Null cuando la zona que hizo matchear al candidato es tipo "barrios": no
  // hay coordenada de barrio en el catalogo para medir una distancia real.
  distanciaKm: number | null;
}

export interface ParametrosCuotaRotacion {
  notificadosIniciales: number;
  cuotaPct: number;
  umbralResenias: number;
}

// docs/dominio.md §6, punto 2: "un puntaje que combina cercania, promedio de
// resenias y tasa de respuesta", sin una formula fija. Estos pesos son un
// punto de partida ajustable durante el piloto (no son parametro_negocio:
// no son un limite ni un tiempo, son pesos de un ranking, y §5 es taxativo).
const PESO_DISTANCIA = 0.5;
const PESO_RESENIAS = 0.3;
const PESO_TASA_RESPUESTA = 0.2;

/**
 * Cuota de rotacion (D6, docs/dominio.md §12): separada del acceso a datos
 * para que se pueda testear con candidatos en memoria, sin mockear
 * `$queryRaw` (apps/api/CLAUDE.md, "no testear... el framework").
 */
export function aplicarCuotaRotacion(
  candidatos: CandidatoMatching[],
  parametros: ParametrosCuotaRotacion,
): string[] {
  const cupoNuevos = Math.round((parametros.notificadosIniciales * parametros.cuotaPct) / 100);

  const nuevos = candidatos
    .filter((candidato) => candidato.cantidadResenias < parametros.umbralResenias)
    .sort((a, b) => distanciaOrdenable(a) - distanciaOrdenable(b));
  const seleccionadosNuevos = nuevos.slice(0, cupoNuevos);
  // Si no alcanzan los perfiles nuevos para llenar la cuota, los cupos
  // sobrantes vuelven al grupo general (docs/dominio.md §6, punto 3): nunca
  // se avisa a menos profesionales por no poder llenar la cuota de rotacion.
  const sobrantesDeLaCuota = nuevos.slice(cupoNuevos);

  const generales = candidatos.filter(
    (candidato) => candidato.cantidadResenias >= parametros.umbralResenias,
  );
  const poolGeneral = [...generales, ...sobrantesDeLaCuota].sort(
    (a, b) => calcularScore(b) - calcularScore(a),
  );

  const cupoRestante = Math.max(parametros.notificadosIniciales - seleccionadosNuevos.length, 0);
  const seleccionadosGenerales = poolGeneral.slice(0, cupoRestante);

  return [...seleccionadosNuevos, ...seleccionadosGenerales].map(
    (candidato) => candidato.usuarioId,
  );
}

/** `null` (zona por barrios, coincidencia explicita) se trata como la distancia mas cercana posible. */
function distanciaOrdenable(candidato: CandidatoMatching): number {
  return candidato.distanciaKm ?? -1;
}

function calcularScore(candidato: CandidatoMatching): number {
  const distanciaScore = candidato.distanciaKm === null ? 1 : 1 / (1 + candidato.distanciaKm);
  const reseniasScore = (candidato.promedioResenias ?? 0) / 5;
  const respuestaScore = candidato.tasaRespuesta ?? 0;
  return (
    distanciaScore * PESO_DISTANCIA +
    reseniasScore * PESO_RESENIAS +
    respuestaScore * PESO_TASA_RESPUESTA
  );
}

/**
 * Matching pedido -> profesionales (docs/dominio.md §6), usado por el job de
 * aviso inicial (BullMQ). No se testea con mocks de $queryRaw: la logica de
 * cuota/scoring vive aparte en `aplicarCuotaRotacion`, testeable en memoria.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  /** Hasta `notificados_iniciales` usuarioId de profesionales coincidentes, con la cuota de rotacion ya aplicada. */
  async buscarCoincidentes(pedidoId: string): Promise<string[]> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: {
        clienteId: true,
        categoriaId: true,
        barrioId: true,
        lat: true,
        lng: true,
        urgencia: true,
      },
    });
    if (!pedido) return [];

    const [notificadosIniciales, cuotaPct, umbralResenias] = await Promise.all([
      this.parametros.getNumero("notificados_iniciales"),
      this.parametros.getNumero("cuota_rotacion_porcentaje"),
      this.parametros.getNumero("rotacion_resenias_umbral"),
    ]);
    // Revision de codigo del slice 5: pedir este parametro incondicionalmente
    // (para CUALQUIER urgencia) hacia que un ambiente sin sembrarlo tumbara
    // el matching entero, no solo el caso de emergencia. Sin urgencia de
    // emergencia el factor es 1 sin consultar ParametrosService.
    const factorEmergencia =
      pedido.urgencia === "emergencia"
        ? await this.parametros.getNumero("radio_aviso_emergencia_factor")
        : 1;

    const candidatos = await this.buscarCandidatos(pedido, factorEmergencia);

    return aplicarCuotaRotacion(candidatos, { notificadosIniciales, cuotaPct, umbralResenias });
  }

  /**
   * docs/dominio.md §6, primer parrafo: oficio en la categoria del pedido,
   * verificacion aprobada, perfil no pausado, y la zona cubre la ubicacion
   * del pedido (barrios explicitos, o radio con PostGIS). Los pedidos de
   * emergencia amplian el radio de aviso con `radio_aviso_emergencia_factor`.
   * Excluye al propio cliente del pedido (cuenta con los dos roles) y a
   * cualquier usuario que no este activo (revision de codigo del slice 5: un
   * profesional suspendido o eliminado no deberia recibir avisos nuevos).
   */
  private async buscarCandidatos(
    pedido: {
      clienteId: string;
      categoriaId: string;
      barrioId: string;
      lat: number;
      lng: number;
      urgencia: string;
    },
    factorEmergencia: number,
  ): Promise<CandidatoMatching[]> {
    const factorRadio = pedido.urgencia === "emergencia" ? factorEmergencia : 1;

    return this.prisma.$queryRaw<CandidatoMatching[]>(Prisma.sql`
      SELECT
        pp.usuario_id AS "usuarioId",
        pp.cantidad_resenias AS "cantidadResenias",
        pp.promedio_resenias AS "promedioResenias",
        pp.tasa_respuesta AS "tasaRespuesta",
        CASE WHEN zc.tipo = 'radio' THEN
          ST_Distance(
            ST_MakePoint(zc.centro_lng, zc.centro_lat)::geography,
            ST_MakePoint(${pedido.lng}, ${pedido.lat})::geography
          ) / 1000
        ELSE NULL END AS "distanciaKm"
      FROM perfil_profesional pp
      JOIN usuario u ON u.id = pp.usuario_id AND u.estado = 'activo'
      JOIN oficio_profesional op ON op.perfil_id = pp.id AND op.categoria_id = ${pedido.categoriaId}
      JOIN zona_cobertura zc ON zc.perfil_id = pp.id
      WHERE pp.estado_verificacion = 'aprobada'
        AND pp.pausado = false
        AND pp.usuario_id <> ${pedido.clienteId}
        AND (
          (zc.tipo = 'barrios' AND ${pedido.barrioId} = ANY(zc.barrio_ids))
          OR (
            zc.tipo = 'radio'
            AND zc.centro_lat IS NOT NULL
            AND zc.centro_lng IS NOT NULL
            AND zc.radio_km IS NOT NULL
            AND ST_DWithin(
              ST_MakePoint(zc.centro_lng, zc.centro_lat)::geography,
              ST_MakePoint(${pedido.lng}, ${pedido.lat})::geography,
              zc.radio_km * 1000 * ${factorRadio}
            )
          )
        )
    `);
  }
}
