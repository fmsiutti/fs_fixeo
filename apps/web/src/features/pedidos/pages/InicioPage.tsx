import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CategoriaVista } from "@fixeo/shared";
import { useSesion } from "../../auth/useSesion";
import {
  categoriasQueryKey,
  misPedidosQueryKey,
  obtenerCategorias,
  obtenerMisPedidos,
} from "../api";
import { hayBorradorEnProgreso, useBorradorPedido } from "../borrador";
import { CategoriasGrid } from "../components/CategoriasGrid";
import { TarjetaPedido } from "../components/TarjetaPedido";
import { Spinner } from "../../../components/ui/Spinner";
import { clasesBoton } from "../../../components/ui/clasesBoton";

/** CL-01 · Inicio. Accesible sin sesion: desde aca se puede publicar sin cuenta. */
export function InicioPage() {
  const { estaAutenticado } = useSesion();
  const navigate = useNavigate();
  const { actualizar } = useBorradorPedido();

  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKey,
    queryFn: obtenerCategorias,
    staleTime: Infinity,
  });

  const misPedidosQuery = useQuery({
    queryKey: misPedidosQueryKey,
    queryFn: obtenerMisPedidos,
    enabled: estaAutenticado,
  });

  function elegirCategoria(categoria: CategoriaVista) {
    actualizar({ categoriaId: categoria.id, queNecesitas: categoria.nombre });
    navigate("/publicar/que");
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-teal-800">Fixeo</h1>
        <Link
          to={estaAutenticado ? "/cuenta" : "/ingresar"}
          className="flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
        >
          {estaAutenticado ? "Mi cuenta" : "Ingresar"}
        </Link>
      </header>

      <Link to="/publicar/que" className={clasesBoton("primario")}>
        Publicar un pedido
      </Link>

      {hayBorradorEnProgreso() && (
        <Link
          to="/publicar/que"
          className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4"
        >
          <div>
            <p className="font-semibold text-teal-900">Seguí donde dejaste</p>
            <p className="text-sm text-teal-700">Tenés un pedido sin terminar de publicar.</p>
          </div>
          <span aria-hidden="true" className="text-xl text-teal-700">
            →
          </span>
        </Link>
      )}

      {estaAutenticado && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-900">Mis pedidos</h2>

          {misPedidosQuery.isPending && <Spinner etiqueta="Cargando tus pedidos" />}

          {misPedidosQuery.isError && (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>No pudimos cargar tus pedidos.</p>
              <button
                type="button"
                className="min-h-11 font-semibold underline"
                onClick={() => misPedidosQuery.refetch()}
              >
                Reintentar
              </button>
            </div>
          )}

          {misPedidosQuery.data && misPedidosQuery.data.length === 0 && (
            <p className="text-sm text-slate-500">Todavía no tenés pedidos activos.</p>
          )}

          {misPedidosQuery.data && misPedidosQuery.data.length > 0 && (
            <div className="flex flex-col gap-3">
              {misPedidosQuery.data.map((pedido) => (
                <TarjetaPedido key={pedido.id} pedido={pedido} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-slate-900">¿Qué hay que arreglar?</h2>

        {categoriasQuery.isPending && <Spinner etiqueta="Cargando categorías" />}

        {categoriasQuery.isError && (
          <p className="text-sm text-red-600" role="alert">
            No pudimos cargar las categorías.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => categoriasQuery.refetch()}
            >
              Reintentar
            </button>
          </p>
        )}

        {categoriasQuery.data && categoriasQuery.data.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no hay categorías cargadas.</p>
        )}

        {categoriasQuery.data && categoriasQuery.data.length > 0 && (
          <CategoriasGrid
            categorias={categoriasQuery.data}
            onSeleccionar={elegirCategoria}
            etiqueta="Categorías de oficios"
          />
        )}
      </section>
    </main>
  );
}
