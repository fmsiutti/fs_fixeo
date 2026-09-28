import { useQuery } from "@tanstack/react-query";
import {
  barriosAdminQueryKey,
  categoriasAdminQueryKey,
  obtenerBarriosAdmin,
  obtenerCategoriasAdmin,
} from "../api";
import { AdminNav } from "../components/AdminNav";
import { FilaBarrioAdmin } from "../components/FilaBarrioAdmin";
import { FormularioCategoriaNueva } from "../components/FormularioCategoriaNueva";
import { TarjetaCategoriaAdmin } from "../components/TarjetaCategoriaAdmin";
import { useSesion } from "../../auth/useSesion";
import { Spinner } from "../../../components/ui/Spinner";

/** AD-04 · Catálogo: categorías (crear/editar/activar) y barrios del piloto (D10, solo activar/desactivar). */
export function CatalogoAdminPage() {
  const { usuario } = useSesion();
  // Soporte es solo lectura en todo el back office.
  const puedeEscribir = usuario?.rolActivo === "moderador";

  const categoriasQuery = useQuery({
    queryKey: categoriasAdminQueryKey,
    queryFn: obtenerCategoriasAdmin,
  });

  const barriosQuery = useQuery({
    queryKey: barriosAdminQueryKey,
    queryFn: obtenerBarriosAdmin,
  });

  return (
    <main id="contenido-principal" className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 bg-white px-6 py-8">
      <AdminNav />

      <header>
        <h1 className="text-2xl font-bold text-teal-800">Catálogo</h1>
        <p className="text-sm text-slate-600">Categorías del piloto y barrios habilitados (D10).</p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-slate-900">Categorías</h2>

        {categoriasQuery.isPending && <Spinner etiqueta="Cargando categorías" />}

        {categoriasQuery.isError && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p role="alert">No pudimos cargar las categorías.</p>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => categoriasQuery.refetch()}
            >
              Reintentar
            </button>
          </div>
        )}

        {categoriasQuery.data && categoriasQuery.data.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no hay categorías cargadas.</p>
        )}

        {categoriasQuery.data && categoriasQuery.data.length > 0 && (
          <ul className="flex flex-col gap-4">
            {categoriasQuery.data.map((categoria) => (
              <TarjetaCategoriaAdmin
                key={categoria.id}
                categoria={categoria}
                puedeEscribir={puedeEscribir}
              />
            ))}
          </ul>
        )}

        {puedeEscribir && <FormularioCategoriaNueva />}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-slate-900">Barrios del piloto</h2>

        {barriosQuery.isPending && <Spinner etiqueta="Cargando barrios" />}

        {barriosQuery.isError && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p role="alert">No pudimos cargar los barrios.</p>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => barriosQuery.refetch()}
            >
              Reintentar
            </button>
          </div>
        )}

        {barriosQuery.data && barriosQuery.data.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no hay barrios cargados.</p>
        )}

        {barriosQuery.data && barriosQuery.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {barriosQuery.data.map((barrio) => (
              <FilaBarrioAdmin key={barrio.id} barrio={barrio} puedeEscribir={puedeEscribir} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
