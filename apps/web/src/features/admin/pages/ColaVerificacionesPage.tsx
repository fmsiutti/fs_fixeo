import { useInfiniteQuery } from "@tanstack/react-query";
import { useSesion } from "../../auth/useSesion";
import { colaVerificacionesQueryKey, obtenerColaVerificaciones } from "../api";
import { ItemVerificacion } from "../components/ItemVerificacion";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";

/** AD-01 · Cola de verificacion. Paginada por cursor con "cargar mas" (sin infinite scroll automatico). */
export function ColaVerificacionesPage() {
  const { usuario } = useSesion();
  // Soporte es solo lectura en todo el back office (apps/api/CLAUDE.md):
  // el backend igual devuelve 403 si se intenta, pero ni mostramos los botones.
  const puedeResolver = usuario?.rolActivo === "moderador";
  // Soporte tampoco ve los documentos: el backend no le firma las URLs a
  // proposito y `item.documentos` llega vacio.
  const puedeVerDocumentos = usuario?.rolActivo === "moderador";

  const query = useInfiniteQuery({
    queryKey: colaVerificacionesQueryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      obtenerColaVerificaciones(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-white px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold text-teal-800">Cola de verificación</h1>
        <p className="text-sm text-slate-600">
          Documentos y datos declarados por los profesionales. Objetivo: menos de 24 h hábiles.
        </p>
      </header>

      {query.isPending && <Spinner etiqueta="Cargando la cola de verificación" />}

      {query.isError && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar la cola de verificación.</p>
          <button type="button" className="font-semibold underline" onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {query.data && items.length === 0 && (
        <p className="text-sm text-slate-500">No hay verificaciones pendientes por ahora.</p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <ItemVerificacion
              key={item.id}
              item={item}
              puedeResolver={puedeResolver}
              puedeVerDocumentos={puedeVerDocumentos}
            />
          ))}
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
