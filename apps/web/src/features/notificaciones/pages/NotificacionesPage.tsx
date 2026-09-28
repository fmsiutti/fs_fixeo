import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { useSesion } from "../../auth/useSesion";
import { marcarNotificacionLeida, notificacionesQueryKey, obtenerNotificaciones } from "../api";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { formatearAntiguedad } from "../../../lib/fecha-relativa";

/** CO-05 · Notificaciones. Lista unificada, paginada por cursor, con enlace directo al objeto. Requiere sesion, cualquier rol. */
export function NotificacionesPage() {
  const { usuario } = useSesion();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: notificacionesQueryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => obtenerNotificaciones(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
    enabled: Boolean(usuario),
  });

  const mutacionLeida = useMutation({
    mutationFn: marcarNotificacionLeida,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificacionesQueryKey });
    },
  });

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }

  const items = query.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold text-teal-800">Notificaciones</h1>
      </header>

      {query.isPending && <Spinner etiqueta="Cargando tus notificaciones" />}

      {query.isError && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar tus notificaciones.</p>
          <button type="button" className="font-semibold underline" onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {query.data && items.length === 0 && (
        <p className="text-sm text-slate-500">No tenés notificaciones todavía.</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const noLeida = item.leidaEn === null;
            return (
              <li key={item.id}>
                <Link
                  to={item.ruta}
                  onClick={() => {
                    if (noLeida) mutacionLeida.mutate(item.id);
                  }}
                  className={`flex min-h-11 flex-col gap-1 rounded-xl border p-4 focus-visible:ring-2 focus-visible:ring-teal-700 ${
                    noLeida ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-slate-900">
                      {noLeida && <span className="sr-only">No leída. </span>}
                      {item.titulo}
                    </p>
                    {noLeida && (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-teal-600"
                      />
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{item.cuerpo}</p>
                  <p className="text-xs text-slate-400">{formatearAntiguedad(item.creadaEn)}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage && (
        <Button
          type="button"
          variante="secundario"
          cargando={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          Cargar más
        </Button>
      )}
    </main>
  );
}
