import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { detalleFeedTrabajoQueryKey, obtenerDetalleFeedTrabajo } from "../api";
import { FormularioDenuncia } from "../components/FormularioDenuncia";
import { pluralizarLugares, formatearDistancia } from "../lib/formato";
import { ETIQUETAS_FRANJA, ETIQUETAS_URGENCIA } from "../../pedidos/etiquetas";
import { clasesBoton } from "../../../components/ui/clasesBoton";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

/** PR-03 · Detalle del pedido para el profesional. */
export function FeedDetalleTrabajoPage() {
  const { id } = useParams<{ id: string }>();
  const [mostrarDenuncia, setMostrarDenuncia] = useState(false);
  const [denunciaEnviada, setDenunciaEnviada] = useState(false);

  const pedidoQuery = useQuery({
    queryKey: detalleFeedTrabajoQueryKey(id ?? ""),
    queryFn: () => obtenerDetalleFeedTrabajo(id ?? ""),
    enabled: Boolean(id),
    retry: false,
  });

  if (!id) {
    return <Navigate to="/trabajos" replace />;
  }

  const error = pedidoQuery.error instanceof ErrorApiHttp ? pedidoQuery.error : null;
  const esConflicto = error?.codigo === "conflicto";
  const esNoEncontrado = error?.codigo === "no_encontrado";

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center gap-2">
        <Link
          to="/trabajos"
          aria-label="Volver al feed de trabajos"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Detalle del pedido</h1>
      </header>

      {pedidoQuery.isPending && <Spinner etiqueta="Cargando el pedido" />}

      {esConflicto && (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>{error?.mensaje}</p>
          <Link to="/trabajos" className={clasesBoton("secundario", "w-auto px-6")}>
            Volver al feed
          </Link>
        </section>
      )}

      {esNoEncontrado && (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>Este pedido ya no está disponible.</p>
          <Link to="/trabajos" className={clasesBoton("secundario", "w-auto px-6")}>
            Volver al feed
          </Link>
        </section>
      )}

      {pedidoQuery.isError && !esConflicto && !esNoEncontrado && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar este pedido.</p>
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => pedidoQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}

      {pedidoQuery.data && (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                {pedidoQuery.data.categoria.nombre}
                {pedidoQuery.data.subcategoria ? ` · ${pedidoQuery.data.subcategoria}` : ""}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {ETIQUETAS_URGENCIA[pedidoQuery.data.urgencia]}
              </span>
            </div>

            <p className="text-sm text-slate-700">{pedidoQuery.data.descripcion}</p>

            {pedidoQuery.data.respuestasGuia &&
              Object.keys(pedidoQuery.data.respuestasGuia).length > 0 && (
                <dl className="flex flex-col gap-1 text-sm text-slate-600">
                  {Object.entries(pedidoQuery.data.respuestasGuia).map(([pregunta, respuesta]) => (
                    <div key={pregunta}>
                      <dt className="font-medium text-slate-700">{pregunta}</dt>
                      <dd>{respuesta}</dd>
                    </div>
                  ))}
                </dl>
              )}

            {pedidoQuery.data.fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {pedidoQuery.data.fotos.map((foto) => (
                  <img
                    key={foto.id}
                    src={urlCompletaApi(foto.url)}
                    alt="Foto del pedido"
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ))}
              </div>
            )}

            <dl className="flex flex-col gap-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>Cliente</dt>
                <dd className="font-medium text-slate-900">
                  {pedidoQuery.data.cliente.nombre ?? "Sin nombre"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Barrio</dt>
                <dd className="font-medium text-slate-900">
                  {pedidoQuery.data.barrio.nombre}
                  {pedidoQuery.data.distanciaKm !== null
                    ? ` · ${formatearDistancia(pedidoQuery.data.distanciaKm)}`
                    : ""}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Franjas</dt>
                <dd className="font-medium text-slate-900">
                  {pedidoQuery.data.franjas
                    .map((franja) => ETIQUETAS_FRANJA[franja] ?? franja)
                    .join(", ")}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Postulaciones</dt>
                <dd className="font-medium text-slate-900">
                  {pedidoQuery.data.cantidadPostulaciones}
                </dd>
              </div>
            </dl>
          </section>

          {pedidoQuery.data.yaEligioAlguien && pedidoQuery.data.seleccionablesLibres > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {(() => {
                const { sustantivo, verbo } = pluralizarLugares(
                  pedidoQuery.data.seleccionablesLibres,
                );
                return `El cliente ya eligió a un profesional, todavía ${verbo} ${sustantivo}`;
              })()}
            </section>
          )}

          <div className="flex flex-col gap-3">
            {(() => {
              // docs/dominio.md §6: sin verificacion aprobada no se puede
              // postular; ese motivo tiene prioridad sobre el cupo lleno.
              if (!pedidoQuery.data.verificacionAprobada) {
                return (
                  <span
                    className={clasesBoton("secundario", "cursor-not-allowed opacity-60")}
                    aria-disabled="true"
                  >
                    Todavía no podés postularte: tu verificación está pendiente de aprobación
                  </span>
                );
              }
              if (pedidoQuery.data.postulacionesCupoLleno) {
                return (
                  <span
                    className={clasesBoton("secundario", "cursor-not-allowed opacity-60")}
                    aria-disabled="true"
                  >
                    Se alcanzó el máximo de postulaciones para este pedido
                  </span>
                );
              }
              return (
                <Link
                  to={`/trabajos/${pedidoQuery.data.id}/postularme`}
                  className={clasesBoton("primario")}
                >
                  Postularme
                </Link>
              );
            })()}

            {!mostrarDenuncia && !denunciaEnviada && (
              <button
                type="button"
                className="min-h-11 self-start text-sm font-semibold text-red-700 underline"
                onClick={() => setMostrarDenuncia(true)}
              >
                Denunciar
              </button>
            )}

            {denunciaEnviada && (
              <p role="status" className="text-sm text-teal-700">
                Recibimos tu denuncia, la vamos a revisar.
              </p>
            )}
          </div>

          {mostrarDenuncia && (
            <FormularioDenuncia
              tipoObjeto="pedido"
              objetoId={pedidoQuery.data.id}
              onExito={() => {
                setMostrarDenuncia(false);
                setDenunciaEnviada(true);
              }}
              onCancelar={() => setMostrarDenuncia(false)}
            />
          )}
        </>
      )}
    </main>
  );
}
