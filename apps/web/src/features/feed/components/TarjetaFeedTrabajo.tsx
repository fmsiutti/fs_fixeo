import { Link } from "react-router-dom";
import type { PedidoFeedItemVista } from "@fixeo/shared";
import { Badge } from "../../../components/ui/Badge";
import { ETIQUETAS_URGENCIA } from "../../pedidos/etiquetas";
import { formatearAntiguedad } from "../../../lib/fecha-relativa";
import { formatearDistancia } from "../lib/formato";

// docs/dominio.md §6: "Distintivo en pedidos con menos de 3 postulaciones".
// Es un umbral fijo del producto (los 3 elegibles), no un parametro de negocio.
const UMBRAL_POCAS_POSTULACIONES = 3;

interface TarjetaFeedTrabajoProps {
  pedido: PedidoFeedItemVista;
}

/** Tarjeta de PR-02, linkea al detalle (PR-03). */
export function TarjetaFeedTrabajo({ pedido }: TarjetaFeedTrabajoProps) {
  const pocasPostulaciones = pedido.cantidadPostulaciones < UMBRAL_POCAS_POSTULACIONES;

  return (
    <Link
      to={`/trabajos/${pedido.id}`}
      className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4 hover:border-teal-600 hover:bg-teal-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{pedido.categoria.nombre}</span>
        <Badge tono={pedido.urgencia === "emergencia" ? "error" : "neutro"}>
          {ETIQUETAS_URGENCIA[pedido.urgencia]}
        </Badge>
      </div>

      <p className="text-sm text-slate-600">
        {pedido.barrio.nombre}
        {pedido.distanciaKm !== null ? ` · ${formatearDistancia(pedido.distanciaKm)}` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{formatearAntiguedad(pedido.publicadoEn ?? pedido.creadoEn)}</span>
        <span aria-hidden="true">·</span>
        <span>
          {pedido.cantidadPostulaciones === 0
            ? "Sin postulaciones todavía"
            : pedido.cantidadPostulaciones === 1
              ? "1 postulación"
              : `${pedido.cantidadPostulaciones} postulaciones`}
        </span>
        {pedido.tieneFotos && (
          <>
            <span aria-hidden="true">·</span>
            <span>Con fotos</span>
          </>
        )}
      </div>

      {(pocasPostulaciones || pedido.yaEligioAlguien) && (
        <div className="flex flex-wrap gap-2">
          {pocasPostulaciones && <Badge tono="exito">Pocas postulaciones</Badge>}
          {pedido.yaEligioAlguien && (
            <Badge tono="advertencia">El cliente ya eligió a alguien</Badge>
          )}
        </div>
      )}
    </Link>
  );
}
