import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MOTIVOS_RECHAZO_VERIFICACION,
  type MotivoRechazoVerificacion,
  type VerificacionColaVista,
} from "@fixeo/shared";
import { colaVerificacionesQueryKey, resolverVerificacion } from "../api";
import { ETIQUETAS_MOTIVO_RECHAZO, ETIQUETAS_TIPO_VERIFICACION } from "../etiquetas";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

// El contrato no trae content-type, solo la extension de la url firmada:
// si "parece" imagen se muestra una miniatura, sino un link que abre en
// pestaña nueva (sirve igual para PDF que para una imagen no reconocida).
function esImagen(url: string): boolean {
  return /\.(jpe?g|png)(\?|$)/i.test(url);
}

interface ItemVerificacionProps {
  item: VerificacionColaVista;
  puedeResolver: boolean;
  puedeVerDocumentos: boolean;
}

/** AD-01 · una fila de la cola de verificacion, con aprobar/rechazar inline. */
export function ItemVerificacion({
  item,
  puedeResolver,
  puedeVerDocumentos,
}: ItemVerificacionProps) {
  const queryClient = useQueryClient();
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRechazoVerificacion | "">("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: resolverVerificacion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: colaVerificacionesQueryKey });
    },
    onError: (err) =>
      setError(
        err instanceof ErrorApiHttp
          ? err.mensaje
          : "No pudimos resolver la verificación. Probá de nuevo.",
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

  const nombreCompleto =
    [item.perfil.nombre, item.perfil.apellido].filter(Boolean).join(" ") ||
    "Profesional sin nombre";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{nombreCompleto}</span>
        <Badge tono="neutro">{ETIQUETAS_TIPO_VERIFICACION[item.tipo]}</Badge>
      </div>

      <p className="text-xs text-slate-500">
        Enviada el {new Date(item.enviadaEn).toLocaleString("es-AR")}
      </p>

      {item.oficio && (
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm text-slate-700">
          <dt className="text-slate-500">Categoría</dt>
          <dd>{item.oficio.categoria.nombre}</dd>
          <dt className="text-slate-500">Número</dt>
          <dd>{item.oficio.matriculaNumero ?? "—"}</dd>
          <dt className="text-slate-500">Ente</dt>
          <dd>{item.oficio.matriculaEnte ?? "—"}</dd>
          <dt className="text-slate-500">Vencimiento</dt>
          <dd>
            {item.oficio.matriculaVenceEn
              ? new Date(item.oficio.matriculaVenceEn).toLocaleDateString("es-AR")
              : "—"}
          </dd>
        </dl>
      )}

      {!puedeVerDocumentos && item.documentos.length === 0 ? (
        <p className="text-sm text-slate-500">Los documentos solo los puede ver un moderador.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {item.documentos.map((url, indice) =>
            esImagen(url) ? (
              <a key={url} href={urlCompletaApi(url)} target="_blank" rel="noreferrer">
                <img
                  src={urlCompletaApi(url)}
                  alt={`Documento ${indice + 1} de ${nombreCompleto}`}
                  className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                />
              </a>
            ) : (
              <a
                key={url}
                href={urlCompletaApi(url)}
                target="_blank"
                rel="noreferrer"
                className="flex h-24 w-24 items-center justify-center rounded-lg border border-slate-200 p-2 text-center text-xs font-semibold text-teal-800 underline"
              >
                Ver documento {indice + 1}
              </a>
            ),
          )}
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
                <label htmlFor={`motivo-${item.id}`} className="text-sm font-medium text-slate-700">
                  Motivo del rechazo
                </label>
                <select
                  id={`motivo-${item.id}`}
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value as MotivoRechazoVerificacion)}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
                >
                  <option value="">Elegí un motivo</option>
                  {MOTIVOS_RECHAZO_VERIFICACION.map((valor) => (
                    <option key={valor} value={valor}>
                      {ETIQUETAS_MOTIVO_RECHAZO[valor]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`detalle-${item.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Detalle (opcional)
                </label>
                <textarea
                  id={`detalle-${item.id}`}
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
