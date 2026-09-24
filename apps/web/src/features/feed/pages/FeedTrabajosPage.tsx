import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { feedTrabajosQueryKey, hayFiltrosActivos, obtenerFeedTrabajos } from "../api";
import type { FiltrosFeedTrabajos as FiltrosFeedTrabajosValor } from "../api";
import { FiltrosFeedTrabajos } from "../components/FiltrosFeedTrabajos";
import { TarjetaFeedTrabajo } from "../components/TarjetaFeedTrabajo";
import { obtenerPerfilProfesional, perfilProfesionalQueryKey } from "../../perfil/api";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";

/** PR-02 · Feed de trabajos. */
export function FeedTrabajosPage() {
  const [filtros, setFiltros] = useState<FiltrosFeedTrabajosValor>({});

  const perfilQuery = useQuery({
    queryKey: perfilProfesionalQueryKey,
    queryFn: obtenerPerfilProfesional,
    retry: false,
  });

  const feedQuery = useInfiniteQuery({
    queryKey: feedTrabajosQueryKey(filtros),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      obtenerFeedTrabajos(filtros, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });

  const perfil = perfilQuery.data;
  // El backend igual devuelve el feed vacio (items: []) cuando no hay perfil
  // armado, con oficios o con zona: sin esta distincion el profesional veria
  // "no hay pedidos" en vez del motivo real (apps/web/CLAUDE.md: cubrir bien
  // el estado vacio).
  const perfilNoArmado =
    perfilQuery.isError &&
    perfilQuery.error instanceof ErrorApiHttp &&
    perfilQuery.error.codigo === "no_encontrado";
  const perfilSinOficiosOZona =
    perfil !== undefined && (perfil.oficios.length === 0 || !perfil.zonaCobertura);
  const perfilIncompleto = perfilNoArmado || perfilSinOficiosOZona;

  const categoriasOficio = perfil?.oficios.map((oficio) => oficio.categoria) ?? [];
  const mostrarFiltroDistancia = perfil?.zonaCobertura?.tipo === "radio";

  const items = feedQuery.data?.pages.flatMap((pagina) => pagina.items) ?? [];
  const primeraPagina = feedQuery.data?.pages[0];
  const mostrarBannerVerificacion =
    primeraPagina?.verificacionAprobada === false && !perfilIncompleto;
  const filtrosActivos = hayFiltrosActivos(filtros);

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-teal-800">Trabajos</h1>
        <Link
          to="/postulaciones"
          className="min-h-11 text-sm font-semibold text-teal-800 underline"
        >
          Mis postulaciones
        </Link>
      </header>

      {mostrarBannerVerificacion && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Tu verificación está pendiente.</p>
          <p>Podés ver los pedidos, pero no vas a poder postularte hasta que la aprobemos.</p>
        </section>
      )}

      <FiltrosFeedTrabajos
        categoriasOficio={categoriasOficio}
        mostrarFiltroDistancia={mostrarFiltroDistancia}
        filtros={filtros}
        onCambiar={setFiltros}
      />

      {feedQuery.isPending && <Spinner etiqueta="Cargando pedidos" />}

      {feedQuery.isError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar los pedidos.</p>
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => feedQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}

      {feedQuery.data && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center">
          {perfilIncompleto ? (
            <>
              <p className="text-slate-700">Terminá de armar tu perfil para ver pedidos.</p>
              <Link to="/perfil/armar" className="min-h-11 font-semibold text-teal-800 underline">
                Armar mi perfil
              </Link>
            </>
          ) : filtrosActivos ? (
            <>
              <p className="text-slate-700">No encontramos pedidos con estos filtros.</p>
              <button
                type="button"
                className="min-h-11 font-semibold text-teal-800 underline"
                onClick={() => setFiltros({})}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <p className="text-slate-700">
              Todavía no hay pedidos que coincidan con tu zona y oficio.
            </p>
          )}
        </div>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((pedido) => (
            <li key={pedido.id}>
              <TarjetaFeedTrabajo pedido={pedido} />
            </li>
          ))}
        </ul>
      )}

      {feedQuery.hasNextPage && (
        <Button
          type="button"
          variante="secundario"
          cargando={feedQuery.isFetchingNextPage}
          onClick={() => feedQuery.fetchNextPage()}
        >
          Cargar más pedidos
        </Button>
      )}
    </main>
  );
}
