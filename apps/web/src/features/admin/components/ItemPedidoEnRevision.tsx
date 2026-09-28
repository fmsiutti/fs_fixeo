import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MOTIVOS_BLOQUEO_PEDIDO,
  type MotivoBloqueoPedido,
  type PedidoModeracionVista,
} from "@fixeo/shared";
import { pedidosEnRevisionQueryKey, resolverEnRevision } from "../api";
import { ETIQUETAS_MOTIVO_BLOQUEO_PEDIDO } from "../etiquetas";
import { ETIQUETAS_URGENCIA } from "../../pedidos/etiquetas";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

interface ItemPedidoEnRevisionProps {
  item: PedidoModeracionVista;
  puedeResolver: boolean;
}

/** AD-02 · un pedido en_revision (D1), con aprobar/rechazar inline. */
export function ItemPedidoEnRevision({ item, puedeResolver }: ItemPedidoEnRevisionProps) {
  const queryClient = useQueryClient();
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [motivo, setMotivo] = useState<MotivoBloqueoPedido | "">("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: resolverEnRevision,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pedidosEnRevisionQueryKey });
    },
    onError: (err) =>
      setError(
        err instanceof ErrorApiHttp
          ? err.mensaje
          : "No pudimos resolver este pedido. Probá de nuevo.",
      ),
  });

  function aprobar() {
    setError(null);
    mutacion.mutate({ id: item.id, datos: { accion: "aprobar" } });
  }

  function confirmarRechazo() {
    if (!motivo) {
      setError("Elegí un motivo de rechazo");
      return;
    }
    setError(null);
    mutacion.mutate({
      id: item.id,
      datos: { accion: "rechazar", motivo, detalle: detalle.trim() || undefined },
    });
  }

  const nombreCliente =
    [item.cliente.nombre, item.cliente.apellido].filter(Boolean).join(" ") || "Cliente de Fixeo";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{nombreCliente}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {item.categoria.nombre}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        {ETIQUETAS_URGENCIA[item.urgencia]} · {item.barrio.nombre} ·{" "}
        {new Date(item.creadoEn).toLocaleString("es-AR")}
      </p>

      <p className="text-sm text-slate-700">{item.descripcion}</p>

      {item.fotos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {item.fotos.map((foto) => (
            <img
              key={foto.id}
              src={urlCompletaApi(foto.url)}
              alt=""
              className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
            />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {puedeResolver && (
        <div className="flex flex-col gap-3">
          {!mostrarRechazo ? (
            <div className="flex gap-3">
              <Button type="button" cargando={mutacion.isPending} onClick={aprobar}>
                Aprobar
              </Button>
              <Button type="button" variante="peligro" onClick={() => setMostrarRechazo(true)}>
                Rechazar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-red-200 p-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`motivo-revision-${item.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Motivo del rechazo
                </label>
                <select
                  id={`motivo-revision-${item.id}`}
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value as MotivoBloqueoPedido)}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
                >
                  <option value="">Elegí un motivo</option>
                  {MOTIVOS_BLOQUEO_PEDIDO.map((valor) => (
                    <option key={valor} value={valor}>
                      {ETIQUETAS_MOTIVO_BLOQUEO_PEDIDO[valor]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`detalle-revision-${item.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Detalle (opcional)
                </label>
                <textarea
                  id={`detalle-revision-${item.id}`}
                  rows={2}
                  value={detalle}
                  onChange={(evento) => setDetalle(evento.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => setMostrarRechazo(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variante="peligro"
                  cargando={mutacion.isPending}
                  onClick={confirmarRechazo}
                >
                  Confirmar rechazo
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
