import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MOTIVOS_BLOQUEO_PEDIDO,
  type MotivoBloqueoPedido,
  type PedidoModeracionVista,
} from "@fixeo/shared";
import { pedidosDenunciadosQueryKey, resolverDenunciaPedido } from "../api";
import { ETIQUETAS_MOTIVO_BLOQUEO_PEDIDO } from "../etiquetas";
import { ETIQUETAS_URGENCIA } from "../../pedidos/etiquetas";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

interface ItemPedidoDenunciadoProps {
  item: PedidoModeracionVista;
  puedeResolver: boolean;
}

/** AD-02 · un pedido denunciado, con las denuncias que lo motivaron y descartar/bloquear inline. */
export function ItemPedidoDenunciado({ item, puedeResolver }: ItemPedidoDenunciadoProps) {
  const queryClient = useQueryClient();
  const [mostrarBloqueo, setMostrarBloqueo] = useState(false);
  const [motivo, setMotivo] = useState<MotivoBloqueoPedido | "">("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: resolverDenunciaPedido,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pedidosDenunciadosQueryKey });
    },
    onError: (err) =>
      setError(
        err instanceof ErrorApiHttp
          ? err.mensaje
          : "No pudimos resolver esta denuncia. Probá de nuevo.",
      ),
  });

  function descartar() {
    setError(null);
    mutacion.mutate({ id: item.id, datos: { accion: "descartar" } });
  }

  function confirmarBloqueo() {
    if (!motivo) {
      setError("Elegí un motivo de bloqueo");
      return;
    }
    setError(null);
    mutacion.mutate({
      id: item.id,
      datos: { accion: "bloquear", motivo, detalle: detalle.trim() || undefined },
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

      <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3">
        <h4 className="text-sm font-semibold text-amber-900">
          Denuncias ({item.denuncias?.length ?? 0})
        </h4>
        {(item.denuncias ?? []).length === 0 ? (
          <p className="text-sm text-amber-900">Sin detalle de denuncias.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {item.denuncias?.map((denuncia) => (
              <li key={denuncia.id} className="text-sm text-amber-900">
                <span className="font-semibold">{denuncia.motivo}</span>
                {denuncia.detalle && <span> — {denuncia.detalle}</span>}
                <span className="block text-xs text-amber-700">
                  {new Date(denuncia.creadoEn).toLocaleString("es-AR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {puedeResolver && (
        <div className="flex flex-col gap-3">
          {!mostrarBloqueo ? (
            <div className="flex gap-3">
              <Button
                type="button"
                variante="secundario"
                cargando={mutacion.isPending}
                onClick={descartar}
              >
                Descartar denuncia
              </Button>
              <Button type="button" variante="peligro" onClick={() => setMostrarBloqueo(true)}>
                Bloquear pedido
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-red-200 p-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`motivo-denuncia-${item.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Motivo del bloqueo
                </label>
                <select
                  id={`motivo-denuncia-${item.id}`}
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
                  htmlFor={`detalle-denuncia-${item.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Detalle (opcional)
                </label>
                <textarea
                  id={`detalle-denuncia-${item.id}`}
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
                  onClick={() => setMostrarBloqueo(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variante="peligro"
                  cargando={mutacion.isPending}
                  onClick={confirmarBloqueo}
                >
                  Confirmar bloqueo
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
