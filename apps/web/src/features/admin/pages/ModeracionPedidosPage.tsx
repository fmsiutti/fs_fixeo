import { useInfiniteQuery } from "@tanstack/react-query";
import { useSesion } from "../../auth/useSesion";
import {
  denunciasModeracionQueryKey,
  obtenerDenunciasModeracion,
  obtenerPedidosDenunciados,
  obtenerPedidosEnRevision,
  pedidosDenunciadosQueryKey,
  pedidosEnRevisionQueryKey,
} from "../api";
import { AdminNav } from "../components/AdminNav";
import { ItemDenunciaModeracion } from "../components/ItemDenunciaModeracion";
import { ItemPedidoDenunciado } from "../components/ItemPedidoDenunciado";
import { ItemPedidoEnRevision } from "../components/ItemPedidoEnRevision";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";

/**
 * AD-02 · Moderación de pedidos: tres colas, en_revision (D1), pedidos
 * denunciados, y denuncias de perfil/postulacion/resenia (D14).
 */
export function ModeracionPedidosPage() {
  const { usuario } = useSesion();
  // Soporte es solo lectura en todo el back office: el backend igual
  // devuelve 403, pero ni mostramos los botones de resolver.
  const puedeResolver = usuario?.rolActivo === "moderador";

  const enRevisionQuery = useInfiniteQuery({
    queryKey: pedidosEnRevisionQueryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      obtenerPedidosEnRevision(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });
  const itemsEnRevision = enRevisionQuery.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  const denunciadosQuery = useInfiniteQuery({
    queryKey: pedidosDenunciadosQueryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      obtenerPedidosDenunciados(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });
  const itemsDenunciados = denunciadosQuery.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  const denunciasModeracionQuery = useInfiniteQuery({
    queryKey: denunciasModeracionQueryKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      obtenerDenunciasModeracion(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });
  const itemsDenunciasModeracion =
    denunciasModeracionQuery.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 bg-white px-6 py-8">
      <AdminNav />

      <header>
        <h1 className="text-2xl font-bold text-teal-800">Moderación de pedidos</h1>
        <p className="text-sm text-slate-600">
          Revisión manual (objetivo: menos de 4 h hábiles) y denuncias de pedidos publicados.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-slate-900">En revisión</h2>

        {enRevisionQuery.isPending && <Spinner etiqueta="Cargando pedidos en revisión" />}

        {enRevisionQuery.isError && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p role="alert">No pudimos cargar la cola de revisión.</p>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => enRevisionQuery.refetch()}
            >
              Reintentar
            </button>
          </div>
        )}

        {enRevisionQuery.data && itemsEnRevision.length === 0 && (
          <p className="text-sm text-slate-500">No hay pedidos esperando revisión.</p>
        )}

        {itemsEnRevision.length > 0 && (
          <ul className="flex flex-col gap-4">
            {itemsEnRevision.map((item) => (
              <ItemPedidoEnRevision key={item.id} item={item} puedeResolver={puedeResolver} />
            ))}
          </ul>
        )}

        {enRevisionQuery.hasNextPage && (
          <Button
            type="button"
            variante="secundario"
            cargando={enRevisionQuery.isFetchingNextPage}
            onClick={() => enRevisionQuery.fetchNextPage()}
          >
            Cargar más
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-slate-900">Denunciados</h2>

        {denunciadosQuery.isPending && <Spinner etiqueta="Cargando pedidos denunciados" />}

        {denunciadosQuery.isError && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p role="alert">No pudimos cargar los pedidos denunciados.</p>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => denunciadosQuery.refetch()}
            >
              Reintentar
            </button>
          </div>
        )}

        {denunciadosQuery.data && itemsDenunciados.length === 0 && (
          <p className="text-sm text-slate-500">No hay pedidos denunciados pendientes.</p>
        )}

        {itemsDenunciados.length > 0 && (
          <ul className="flex flex-col gap-4">
            {itemsDenunciados.map((item) => (
              <ItemPedidoDenunciado key={item.id} item={item} puedeResolver={puedeResolver} />
            ))}
          </ul>
        )}

        {denunciadosQuery.hasNextPage && (
          <Button
            type="button"
            variante="secundario"
            cargando={denunciadosQuery.isFetchingNextPage}
            onClick={() => denunciadosQuery.fetchNextPage()}
          >
            Cargar más
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-slate-900">
          Denuncias de perfil, postulación y reseña
        </h2>

        {denunciasModeracionQuery.isPending && (
          <Spinner etiqueta="Cargando denuncias de perfiles, postulaciones y reseñas" />
        )}

        {denunciasModeracionQuery.isError && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p role="alert">No pudimos cargar esta cola de denuncias.</p>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => denunciasModeracionQuery.refetch()}
            >
              Reintentar
            </button>
          </div>
        )}

        {denunciasModeracionQuery.data && itemsDenunciasModeracion.length === 0 && (
          <p className="text-sm text-slate-500">No hay denuncias pendientes de este tipo.</p>
        )}

        {itemsDenunciasModeracion.length > 0 && (
          <ul className="flex flex-col gap-4">
            {itemsDenunciasModeracion.map((item) => (
              <ItemDenunciaModeracion key={item.id} item={item} puedeResolver={puedeResolver} />
            ))}
          </ul>
        )}

        {denunciasModeracionQuery.hasNextPage && (
          <Button
            type="button"
            variante="secundario"
            cargando={denunciasModeracionQuery.isFetchingNextPage}
            onClick={() => denunciasModeracionQuery.fetchNextPage()}
          >
            Cargar más
          </Button>
        )}
      </section>
    </main>
  );
}
