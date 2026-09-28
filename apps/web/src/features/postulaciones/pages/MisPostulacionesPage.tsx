import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GRUPOS_ESTADO_POSTULACION,
  type GrupoEstadoPostulacion,
  type PostulacionVistaProfesional,
} from "@fixeo/shared";
import { misPostulacionesQueryKey, obtenerMisPostulaciones, retirarPostulacion } from "../api";
import { ETIQUETAS_ESTADO_POSTULACION, ETIQUETAS_GRUPO_POSTULACION } from "../etiquetas";
import { formatearEstimacion } from "../lib/formato";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";
import { formatearAntiguedad } from "../../../lib/fecha-relativa";

const MENSAJES_VACIO: Record<GrupoEstadoPostulacion, string> = {
  enviadas: "Todavía no te postulaste a ningún pedido.",
  seleccionadas: "Ningún cliente te eligió todavía.",
  cerradas: "No tenés postulaciones cerradas.",
};

const LARGO_MAX_DESCRIPCION = 140;

function truncarDescripcion(texto: string): string {
  return texto.length > LARGO_MAX_DESCRIPCION ? `${texto.slice(0, LARGO_MAX_DESCRIPCION)}…` : texto;
}

interface TarjetaPostulacionProps {
  postulacion: PostulacionVistaProfesional;
  mostrarRetirar: boolean;
}

/** PR-05: una postulacion propia, en cualquiera de las tres pestañas. */
function TarjetaPostulacion({ postulacion, mostrarRetirar }: TarjetaPostulacionProps) {
  const queryClient = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);

  const mutacionRetirar = useMutation({
    mutationFn: () => retirarPostulacion(postulacion.id),
    onSuccess: () => {
      setConfirmando(false);
      // Retirar mueve la postulacion de "enviadas" a "cerradas": invalidamos
      // las tres pestañas (mismo prefijo de query key) en vez de solo la actual.
      void queryClient.invalidateQueries({ queryKey: ["postulaciones"] });
    },
  });

  const puedeRetirar = postulacion.estado === "enviada" || postulacion.estado === "vista";

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/trabajos/${postulacion.pedido.id}`}
          className="font-semibold text-teal-800 underline"
        >
          {postulacion.pedido.categoria.nombre}
        </Link>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {ETIQUETAS_ESTADO_POSTULACION[postulacion.estado]}
        </span>
      </div>
      <p className="text-sm text-slate-700">{truncarDescripcion(postulacion.pedido.descripcion)}</p>
      <p className="text-sm font-medium text-slate-900">
        {formatearEstimacion(postulacion.estimacion)}
      </p>
      <p className="text-xs text-slate-500">Enviada {formatearAntiguedad(postulacion.enviadaEn)}</p>

      {/* D2 (docs/dominio.md §4/§12): texto exacto de PR-05. */}
      {postulacion.otroYaElegido && (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
          El cliente eligió a otro; todavía podés ser elegido.
        </p>
      )}

      {/* PR-06: la pestaña "seleccionadas" enlaza al contacto habilitado. */}
      {postulacion.estado === "seleccionada" && (
        <Link
          to={`/postulaciones/${postulacion.id}/elegido`}
          className="min-h-11 self-start text-sm font-semibold text-teal-800 underline"
        >
          Ver contacto
        </Link>
      )}

      {mostrarRetirar && puedeRetirar && (
        <div className="flex flex-col gap-2">
          {!confirmando ? (
            <button
              type="button"
              className="min-h-11 self-start text-sm font-semibold text-red-700 underline"
              onClick={() => setConfirmando(true)}
            >
              Retirar postulación
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-red-200 p-3">
              <p className="text-sm text-red-800">
                ¿Retirar esta postulación? No se puede deshacer.
              </p>
              {mutacionRetirar.isError && (
                <p role="alert" className="text-sm text-red-700">
                  {mutacionRetirar.error instanceof ErrorApiHttp
                    ? mutacionRetirar.error.mensaje
                    : "No pudimos retirar la postulación."}
                </p>
              )}
              <div className="flex gap-3">
                <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
                  No, volver
                </Button>
                <Button
                  type="button"
                  variante="peligro"
                  cargando={mutacionRetirar.isPending}
                  onClick={() => mutacionRetirar.mutate()}
                >
                  Sí, retirar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** PR-05 · Mis postulaciones. */
export function MisPostulacionesPage() {
  const [grupo, setGrupo] = useState<GrupoEstadoPostulacion>("enviadas");

  const postulacionesQuery = useInfiniteQuery({
    queryKey: misPostulacionesQueryKey(grupo),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      obtenerMisPostulaciones(grupo, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });

  const items = postulacionesQuery.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-teal-800">Mis postulaciones</h1>
        <Link to="/trabajos" className="min-h-11 text-sm font-semibold text-teal-800 underline">
          Ver trabajos
        </Link>
      </header>

      <div role="tablist" aria-label="Tus postulaciones" className="flex gap-2">
        {GRUPOS_ESTADO_POSTULACION.map((opcion) => (
          <button
            key={opcion}
            type="button"
            role="tab"
            id={`tab-${opcion}`}
            aria-selected={grupo === opcion}
            aria-controls={`panel-${opcion}`}
            onClick={() => setGrupo(opcion)}
            className={`min-h-11 flex-1 rounded-full px-3 text-sm font-semibold transition ${
              grupo === opcion
                ? "bg-teal-700 text-white"
                : "border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {ETIQUETAS_GRUPO_POSTULACION[opcion]}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${grupo}`}
        aria-labelledby={`tab-${grupo}`}
        className="flex flex-col gap-4"
      >
        {postulacionesQuery.isPending && <Spinner etiqueta="Cargando tus postulaciones" />}

        {postulacionesQuery.isError && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p role="alert">No pudimos cargar tus postulaciones.</p>
            <button
              type="button"
              className="min-h-11 font-semibold underline"
              onClick={() => postulacionesQuery.refetch()}
            >
              Reintentar
            </button>
          </div>
        )}

        {postulacionesQuery.data && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center">
            <p className="text-slate-700">{MENSAJES_VACIO[grupo]}</p>
            <Link to="/trabajos" className="min-h-11 font-semibold text-teal-800 underline">
              Ver el feed de trabajos
            </Link>
          </div>
        )}

        {items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.map((postulacion) => (
              <TarjetaPostulacion
                key={postulacion.id}
                postulacion={postulacion}
                mostrarRetirar={grupo === "enviadas"}
              />
            ))}
          </ul>
        )}

        {postulacionesQuery.hasNextPage && (
          <Button
            type="button"
            variante="secundario"
            cargando={postulacionesQuery.isFetchingNextPage}
            onClick={() => postulacionesQuery.fetchNextPage()}
          >
            Cargar más postulaciones
          </Button>
        )}
      </div>
    </main>
  );
}
