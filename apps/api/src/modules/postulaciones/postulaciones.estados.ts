import { ConflictException } from "@nestjs/common";
import type { EstadoPostulacion } from "@fixeo/shared";
import type { Postulacion, Prisma } from "../../generated/prisma/client.js";

/**
 * Tabla de transiciones validas de Postulacion (docs/dominio.md §4). Incluye
 * transiciones que este slice todavia no dispara (la seleccion es del
 * slice 7) para no tener que volver a tocar este archivo cada vez que otro
 * slice agregue una accion sobre la misma entidad (mismo criterio que
 * pedidos.estados.ts).
 */
const TRANSICIONES_VALIDAS: Record<EstadoPostulacion, readonly EstadoPostulacion[]> = {
  enviada: ["vista", "descartada", "retirada", "caducada", "seleccionada"],
  vista: ["descartada", "retirada", "caducada", "seleccionada"],
  // Revertir el descarte dentro de la ventana de 24 h (parametro_negocio
  // "descarte_reversible_horas") vuelve la postulacion a "vista": el cliente
  // ya la habia abierto antes de descartarla.
  descartada: ["vista"],
  retirada: [],
  caducada: [],
  // docs/dominio.md §4: "Rechazar despues de ser elegido queda registrado".
  // El slice 7 (seleccion) es quien realmente dispara seleccionada -> retirada.
  seleccionada: ["retirada"],
};

export function validarTransicion(origen: EstadoPostulacion, destino: EstadoPostulacion): void {
  if (!TRANSICIONES_VALIDAS[origen].includes(destino)) {
    throw new ConflictException({
      codigo: "conflicto",
      mensaje: `No se puede pasar la postulación de "${origen}" a "${destino}"`,
    });
  }
}

/**
 * Unico punto por el que una Postulacion cambia de estado (CLAUDE.md, regla
 * no negociable #1), siempre dentro de un `prisma.$transaction`. Mismo patron
 * que `transicionar()` de pedidos.estados.ts: `updateMany` condicional al
 * estado de origen, que sirve de guarda de concurrencia sin necesitar un
 * `SELECT ... FOR UPDATE` aparte.
 */
export async function transicionar(
  tx: Prisma.TransactionClient,
  postulacionId: string,
  origen: EstadoPostulacion,
  destino: EstadoPostulacion,
  datosAdicionales: Omit<Prisma.PostulacionUpdateInput, "estado"> = {},
): Promise<Postulacion> {
  validarTransicion(origen, destino);

  const resultado = await tx.postulacion.updateMany({
    where: { id: postulacionId, estado: origen },
    data: { ...datosAdicionales, estado: destino },
  });

  if (resultado.count === 0) {
    throw new ConflictException({
      codigo: "conflicto",
      mensaje: `La postulación ya no está en estado "${origen}"`,
    });
  }

  return tx.postulacion.findUniqueOrThrow({ where: { id: postulacionId } });
}

/**
 * docs/dominio.md §4 (tabla D2), tercera fila: cuando el pedido pasa a
 * `cerrado`, `expirado`, `cancelado` o `bloqueado`, sus postulaciones
 * `enviada`/`vista` pasan a `caducada`. Con D2/D3 (seleccion multiple, las no
 * elegidas siguen vivas mientras quede cupo) esto no es un caso raro: un
 * pedido con 1 de 3 elegidos que cierra casi siempre tiene postulaciones
 * abiertas colgadas si nadie las caduca. Punto unico para las 3 transiciones
 * de Pedido que lo disparan (expirar, cerrar, cierre automatico); siempre
 * dentro de la misma transaccion que la transicion del pedido, sin aviso al
 * profesional (la tabla de §4 solo avisa "caducada" en `cancelado`).
 */
export async function caducarPostulacionesAbiertas(
  tx: Prisma.TransactionClient,
  pedidoId: string,
): Promise<void> {
  const abiertas = await tx.postulacion.findMany({
    where: { pedidoId, estado: { in: ["enviada", "vista"] } },
    select: { id: true, estado: true },
  });
  for (const postulacion of abiertas) {
    await transicionar(tx, postulacion.id, postulacion.estado, "caducada");
  }
}
