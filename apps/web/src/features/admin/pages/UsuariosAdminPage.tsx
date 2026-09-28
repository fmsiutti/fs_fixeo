import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { buscarUsuarios, usuariosBusquedaQueryKey } from "../api";
import { AdminNav } from "../components/AdminNav";
import { ItemUsuarioBusqueda } from "../components/ItemUsuarioBusqueda";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";

/** AD-03 · Usuarios: busqueda de texto libre (sin filtro = lista general) y resultados paginados. */
export function UsuariosAdminPage() {
  const [terminoInput, setTerminoInput] = useState("");
  const [terminoBuscado, setTerminoBuscado] = useState("");

  const query = useInfiniteQuery({
    queryKey: usuariosBusquedaQueryKey(terminoBuscado),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      buscarUsuarios(terminoBuscado, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultimaPagina) => ultimaPagina.cursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((pagina) => pagina.items) ?? [];

  return (
    <main id="contenido-principal" className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-white px-6 py-8">
      <AdminNav />

      <header>
        <h1 className="text-2xl font-bold text-teal-800">Usuarios</h1>
        <p className="text-sm text-slate-600">
          Buscá por nombre, apellido o teléfono. Sin texto, se lista a todos.
        </p>
      </header>

      <form
        role="search"
        className="flex gap-2"
        onSubmit={(evento) => {
          evento.preventDefault();
          setTerminoBuscado(terminoInput.trim());
        }}
      >
        <label htmlFor="buscar-usuario" className="sr-only">
          Buscar usuario
        </label>
        <input
          id="buscar-usuario"
          type="search"
          value={terminoInput}
          onChange={(evento) => setTerminoInput(evento.target.value)}
          placeholder="Nombre, apellido o teléfono"
          className="min-h-11 flex-1 rounded-lg border border-slate-300 px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        />
        <Button type="submit" className="w-auto px-6">
          Buscar
        </Button>
      </form>

      {query.isPending && <Spinner etiqueta="Buscando usuarios" />}

      {query.isError && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos buscar usuarios.</p>
          <button type="button" className="font-semibold underline" onClick={() => query.refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {query.data && items.length === 0 && (
        <p className="text-sm text-slate-500">
          {terminoBuscado ? "No encontramos usuarios con ese texto." : "Todavía no hay usuarios."}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((usuario) => (
            <ItemUsuarioBusqueda key={usuario.id} usuario={usuario} />
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
