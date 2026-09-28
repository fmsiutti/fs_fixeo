import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Recalcula `promedioResenias`/`cantidadResenias` de un perfil profesional
 * (docs/dominio.md §8). Volumen bajo (piloto): recalcular con avg()/count()
 * sobre la tabla es mas simple y mas dificil de desincronizar que llevar la
 * cuenta a mano. Se usa al crear una reseña (PedidosCierreService.cerrar) y
 * al ocultarla definitivamente por moderacion (DenunciasService.resolverNoPedido,
 * D14): segundo uso real, de ahi que se extraiga (CLAUDE.md raiz,
 * anti-sobreingenieria #3).
 *
 * Excluye las ocultas por moderacion: no cuentan en el promedio.
 */
export async function recalcularPromedioResenias(
  tx: Prisma.TransactionClient,
  profesionalId: string,
): Promise<void> {
  const agregado = await tx.resenia.aggregate({
    where: { profesionalId, ocultaPorModeracionEn: null },
    _avg: { puntaje: true },
    _count: { _all: true },
  });
  await tx.perfilProfesional.update({
    where: { id: profesionalId },
    data: { promedioResenias: agregado._avg.puntaje, cantidadResenias: agregado._count._all },
  });
}
