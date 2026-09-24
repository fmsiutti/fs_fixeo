import { ConflictException } from "@nestjs/common";
import type { EstadoPedido } from "@fixeo/shared";
import type { Pedido, Prisma } from "../../generated/prisma/client.js";

/**
 * Tabla de transiciones validas de Pedido (docs/dominio.md §3). Incluye
 * transiciones que este slice todavia no dispara (en_revision -> bloqueado,
 * expiracion, moderacion sobre contacto_habilitado) para no tener que
 * volver a tocar este archivo cada vez que otro slice agregue una accion
 * sobre la misma entidad.
 */
const TRANSICIONES_VALIDAS: Record<EstadoPedido, readonly EstadoPedido[]> = {
  borrador: ["publicado", "en_revision"],
  // en_revision -> cancelado: decision explicita (docs/dominio.md §3 y §12),
  // por encima del texto original de D5. Sin ella, un falso positivo del
  // control automatico de datos de contacto deja al cliente sin ninguna
  // salida hasta que exista moderacion (AD-02, slice 9), ocupando cupo activo
  // indefinidamente. CL-07 ya documentaba "en revision: solo se puede
  // cancelar".
  en_revision: ["publicado", "bloqueado", "cancelado"],
  publicado: ["con_postulaciones", "contacto_habilitado", "cancelado", "expirado", "bloqueado"],
  con_postulaciones: ["contacto_habilitado", "cancelado", "expirado", "bloqueado"],
  contacto_habilitado: ["cerrado", "bloqueado"],
  cerrado: [],
  expirado: [],
  cancelado: [],
  bloqueado: [],
};

export function validarTransicion(origen: EstadoPedido, destino: EstadoPedido): void {
  if (!TRANSICIONES_VALIDAS[origen].includes(destino)) {
    throw new ConflictException({
      codigo: "conflicto",
      mensaje: `No se puede pasar el pedido de "${origen}" a "${destino}"`,
    });
  }
}

/**
 * docs/dominio.md §6 (ultimo bloque) y §4/D2/D3: un pedido acepta nuevas
 * postulaciones si esta `publicado` o `con_postulaciones`, o si esta
 * `contacto_habilitado` pero todavia le queda cupo de elegibles Y de
 * postulaciones. Mismo criterio que ya usan `armarWhereDeCobertura` y
 * `obtenerDelFeed` de pedidos-feed.service.ts (PR-02/PR-03) para decidir si
 * un pedido sigue en el feed del profesional: se extrae aca porque
 * PostulacionesService.crear (PR-04) necesita exactamente la misma regla
 * para decidir si acepta el POST, y las dos tienen que estar sincronizadas.
 */
export function puedeRecibirPostulaciones(
  pedido: { estado: EstadoPedido; cantidadContactos: number; cantidadPostulaciones: number },
  seleccionablesMax: number,
  postulacionesMax: number,
): boolean {
  if (pedido.estado === "publicado" || pedido.estado === "con_postulaciones") return true;
  if (pedido.estado !== "contacto_habilitado") return false;
  return (
    pedido.cantidadContactos < seleccionablesMax && pedido.cantidadPostulaciones < postulacionesMax
  );
}

/**
 * Unico punto por el que un Pedido cambia de estado (CLAUDE.md, regla no
 * negociable #1: nunca un `update({ estado })` suelto). Se llama siempre
 * dentro de un `prisma.$transaction`.
 *
 * El update es condicional al estado de origen (`updateMany` con `estado`
 * en el `where`), asi que sirve como guarda de concurrencia sin necesitar un
 * `SELECT ... FOR UPDATE` aparte: si el estado cambio entre la lectura previa
 * y esta escritura, `count` da 0 y se informa conflicto en vez de pisar una
 * transicion ajena (mismo patron que la rotacion de refresh token en
 * AuthService).
 */
export async function transicionar(
  tx: Prisma.TransactionClient,
  pedidoId: string,
  origen: EstadoPedido,
  destino: EstadoPedido,
  datosAdicionales: Omit<Prisma.PedidoUpdateInput, "estado"> = {},
): Promise<Pedido> {
  validarTransicion(origen, destino);

  const resultado = await tx.pedido.updateMany({
    where: { id: pedidoId, estado: origen },
    data: { ...datosAdicionales, estado: destino },
  });

  if (resultado.count === 0) {
    throw new ConflictException({
      codigo: "conflicto",
      mensaje: `El pedido ya no esta en estado "${origen}"`,
    });
  }

  return tx.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
}
