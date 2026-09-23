import { Link } from "react-router-dom";
import type { PedidoResumenVista } from "@fixeo/shared";
import { ETIQUETAS_ESTADO_PEDIDO } from "../etiquetas";

const COLOR_POR_ESTADO: Record<string, string> = {
  en_revision: "bg-amber-100 text-amber-800",
  publicado: "bg-teal-100 text-teal-800",
  con_postulaciones: "bg-teal-100 text-teal-800",
  contacto_habilitado: "bg-teal-100 text-teal-800",
  cancelado: "bg-slate-200 text-slate-600",
  bloqueado: "bg-red-100 text-red-700",
  cerrado: "bg-slate-200 text-slate-600",
  expirado: "bg-slate-200 text-slate-600",
};

interface TarjetaPedidoProps {
  pedido: PedidoResumenVista;
}

/** Tarjeta de "Mis pedidos" en CL-01, linkea al detalle (CL-07). */
export function TarjetaPedido({ pedido }: TarjetaPedidoProps) {
  const colorEstado = COLOR_POR_ESTADO[pedido.estado] ?? "bg-slate-200 text-slate-600";

  return (
    <Link
      to={`/pedidos/${pedido.id}`}
      className="flex min-h-11 flex-col gap-2 rounded-2xl border border-slate-200 p-4 hover:border-teal-600 hover:bg-teal-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{pedido.categoria.nombre}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colorEstado}`}>
          {ETIQUETAS_ESTADO_PEDIDO[pedido.estado]}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-slate-600">{pedido.descripcion}</p>
    </Link>
  );
}
