import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSesion } from "../../auth/useSesion";
import {
  obtenerPostulacionesDePedido,
  postulacionesDePedidoQueryKey,
} from "../../postulaciones/api";
import { TarjetaPostulacionCliente } from "../../postulaciones/components/TarjetaPostulacionCliente";
import { pluralizarLugares } from "../../feed/lib/formato";
import { cancelarPedido, misPedidosQueryKey, obtenerPedido, pedidoQueryKey } from "../api";
import { ETIQUETAS_ESTADO_PEDIDO, ETIQUETAS_FRANJA, ETIQUETAS_URGENCIA } from "../etiquetas";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

const ESTADOS_CON_ACCIONES = ["publicado", "con_postulaciones"];
// CL-07 (docs/pantallas.md): en_revision "sin contador ni sugerencias, y solo
// se puede cancelar" — por eso no entra en ESTADOS_CON_ACCIONES (que trae
// compartir + vistas/postulaciones) pero si puede cancelar.
const ESTADOS_CANCELABLES = ["en_revision", ...ESTADOS_CON_ACCIONES];

function textoErrorCancelar(error: unknown): string {
  if (error instanceof ErrorApiHttp) return error.mensaje;
  return "No pudimos cancelar el pedido. Probá de nuevo.";
}

/** CL-07 · Esperando postulaciones. Requiere sesion (el pedido siempre pertenece al usuario). */
export function PedidoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const [mostrarConfirmarCancelar, setMostrarConfirmarCancelar] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [copiadoAlPortapapeles, setCopiadoAlPortapapeles] = useState(false);

  const pedidoQuery = useQuery({
    queryKey: pedidoQueryKey(id ?? ""),
    queryFn: () => obtenerPedido(id ?? ""),
    enabled: Boolean(usuario) && Boolean(id),
  });

  const mutacionCancelar = useMutation({
    mutationFn: () => cancelarPedido(id ?? ""),
    onSuccess: (pedidoActualizado) => {
      queryClient.setQueryData(pedidoQueryKey(id ?? ""), pedidoActualizado);
      // Un pedido cancelado deja de ser "activo": si no invalidamos, CL-01
      // lo seguiria mostrando en "Mis pedidos" con el estado viejo en cache.
      void queryClient.invalidateQueries({ queryKey: misPedidosQueryKey });
      setMostrarConfirmarCancelar(false);
      setErrorCancelar(null);
    },
    onError: (error) => setErrorCancelar(textoErrorCancelar(error)),
  });

  // CL-08: mismo pedido, momento distinto ("ya tiene postulaciones"). Se
  // activa recien cuando el pedido las tiene, para no pedirle a la api algo
  // que CL-07 (0 postulaciones) no necesita.
  const postulacionesQuery = useQuery({
    queryKey: postulacionesDePedidoQueryKey(id ?? ""),
    queryFn: () => obtenerPostulacionesDePedido(id ?? ""),
    enabled: Boolean(usuario) && Boolean(id) && (pedidoQuery.data?.cantidadPostulaciones ?? 0) > 0,
  });

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }
  if (!id) {
    return <Navigate to="/" replace />;
  }

  async function compartir() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mi pedido en Fixeo", url });
      } catch {
        // El usuario cancelo el share o el navegador no lo soporta del todo: no hay nada que avisar.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiadoAlPortapapeles(true);
    } catch {
      setCopiadoAlPortapapeles(false);
    }
  }

  const pedido = pedidoQuery.data;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center gap-2">
        <Link
          to="/"
          aria-label="Volver al inicio"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Tu pedido</h1>
      </header>

      {pedidoQuery.isPending && <Spinner etiqueta="Cargando tu pedido" />}

      {pedidoQuery.isError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>
            {pedidoQuery.error instanceof ErrorApiHttp &&
            pedidoQuery.error.codigo === "no_encontrado"
              ? "Este pedido no existe o no es tuyo."
              : "No pudimos cargar tu pedido."}
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              className="min-h-11 font-semibold underline"
              onClick={() => pedidoQuery.refetch()}
            >
              Reintentar
            </button>
            <Link to="/" className="flex min-h-11 items-center font-semibold underline">
              Volver al inicio
            </Link>
          </div>
        </div>
      )}

      {pedido && (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">{pedido.categoria.nombre}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {ETIQUETAS_ESTADO_PEDIDO[pedido.estado]}
              </span>
            </div>

            <p className="text-sm text-slate-700">{pedido.descripcion}</p>

            {pedido.fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {pedido.fotos.map((foto) => (
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
                <dt>Barrio</dt>
                <dd className="font-medium text-slate-900">{pedido.barrio.nombre}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Urgencia</dt>
                <dd className="font-medium text-slate-900">
                  {ETIQUETAS_URGENCIA[pedido.urgencia]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Franjas</dt>
                <dd className="font-medium text-slate-900">
                  {pedido.franjas.map((franja) => ETIQUETAS_FRANJA[franja] ?? franja).join(", ")}
                </dd>
              </div>
            </dl>
          </section>

          {pedido.estado === "en_revision" && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p className="font-semibold">Lo estamos revisando</p>
              <p className="text-sm">Te avisamos en unas horas.</p>
            </section>
          )}

          {ESTADOS_CON_ACCIONES.includes(pedido.estado) && (
            <>
              {pedido.estado === "publicado" && (
                <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-teal-900">
                  <p className="font-semibold">¡Tu pedido está publicado!</p>
                  <p className="text-sm">Te avisamos apenas llegue una postulación.</p>
                </section>
              )}

              <div className="flex gap-4 text-center">
                <div className="flex-1 rounded-xl border border-slate-200 p-3">
                  <p className="text-2xl font-bold text-slate-900">{pedido.vistas}</p>
                  <p className="text-xs text-slate-500">Vistas</p>
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 p-3">
                  <p className="text-2xl font-bold text-slate-900">
                    {pedido.cantidadPostulaciones}
                  </p>
                  <p className="text-xs text-slate-500">Postulaciones</p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* docs/dominio.md §3: se edita solo hasta la primera postulacion. */}
                {pedido.estado === "publicado" && pedido.cantidadPostulaciones === 0 && (
                  <Link
                    to={`/pedidos/${pedido.id}/editar`}
                    className="flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Editar pedido
                  </Link>
                )}
                <Button type="button" variante="secundario" onClick={compartir}>
                  Compartir
                </Button>
                {copiadoAlPortapapeles && (
                  <p role="status" className="text-sm text-teal-700">
                    Copiamos el link al portapapeles.
                  </p>
                )}
              </div>
            </>
          )}

          {/* CL-08: mismo pedido, distinto momento. Se muestra en cuanto hay
              postulaciones, sin importar el estado (con_postulaciones o
              contacto_habilitado si ya hubo seleccion en un slice futuro). */}
          {pedido.cantidadPostulaciones > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-slate-900">Postulaciones</h2>

              {/*
                D2 (docs/dominio.md §4/§12): "las demas siguen elegibles y se
                muestra cuantos lugares quedan". El backend ya calcula
                `cantidadContactos` y `seleccionablesLibres` (CL-08, revision
                de codigo del slice 6): el aviso solo aparece cuando hubo al
                menos una eleccion Y todavia queda lugar, para no mentir
                cuando el cupo de elegibles ya se completo.
              */}
              {pedido.cantidadContactos > 0 && pedido.seleccionablesLibres > 0 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {(() => {
                    // CL-08 es la pantalla del dueno del pedido: voseo en
                    // primera persona (a diferencia del mismo aviso en PR-03,
                    // que le habla al profesional sobre "el cliente"), y D2
                    // pide mostrar cuantos lugares quedan, no solo que quedan.
                    const { sustantivo, verbo } = pluralizarLugares(pedido.seleccionablesLibres);
                    return `Ya elegiste a un profesional, todavía ${verbo} ${sustantivo}.`;
                  })()}
                </p>
              )}

              {pedido.postulacionesCupoLleno && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Este pedido alcanzó el máximo de postulaciones.
                </p>
              )}

              {postulacionesQuery.isPending && <Spinner etiqueta="Cargando las postulaciones" />}

              {postulacionesQuery.isError && (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p role="alert">No pudimos cargar las postulaciones.</p>
                  <button
                    type="button"
                    className="min-h-11 font-semibold underline"
                    onClick={() => postulacionesQuery.refetch()}
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {postulacionesQuery.data && postulacionesQuery.data.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {postulacionesQuery.data.map((postulacion) => (
                    <TarjetaPostulacionCliente
                      key={postulacion.id}
                      pedidoId={pedido.id}
                      postulacion={postulacion}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {ESTADOS_CANCELABLES.includes(pedido.estado) && (
            <div className="flex flex-col gap-3">
              {!mostrarConfirmarCancelar ? (
                <Button
                  type="button"
                  variante="peligro"
                  onClick={() => setMostrarConfirmarCancelar(true)}
                >
                  Cancelar pedido
                </Button>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-red-200 p-4">
                  <p className="text-sm text-red-800">
                    ¿Seguro que querés cancelar este pedido? No se puede deshacer.
                  </p>
                  {errorCancelar && (
                    <p role="alert" className="text-sm text-red-700">
                      {errorCancelar}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variante="secundario"
                      onClick={() => setMostrarConfirmarCancelar(false)}
                    >
                      No, volver
                    </Button>
                    <Button
                      type="button"
                      variante="peligro"
                      cargando={mutacionCancelar.isPending}
                      onClick={() => mutacionCancelar.mutate()}
                    >
                      Sí, cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {pedido.estado === "cancelado" && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              <p className="font-semibold">Cancelaste este pedido.</p>
            </section>
          )}

          {!ESTADOS_CANCELABLES.includes(pedido.estado) && pedido.estado !== "cancelado" && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              <p className="font-semibold">Estado: {ETIQUETAS_ESTADO_PEDIDO[pedido.estado]}</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
