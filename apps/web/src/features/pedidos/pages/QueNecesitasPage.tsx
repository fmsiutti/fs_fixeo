import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CategoriaVista } from "@fixeo/shared";
import { categoriasQueryKey, obtenerCategorias, registrarEvento } from "../api";
import { useBorradorPedido } from "../borrador";
import { AsistenteHeader } from "../components/AsistenteHeader";
import { CategoriasGrid } from "../components/CategoriasGrid";
import { Spinner } from "../../../components/ui/Spinner";

function ordenarCategorias(categorias: CategoriaVista[], texto: string): CategoriaVista[] {
  const normalizado = texto.trim().toLowerCase();
  const porNombre = (a: CategoriaVista, b: CategoriaVista) =>
    a.nombre.localeCompare(b.nombre, "es");

  const principales = categorias.filter((categoria) => categoria.slug !== "otro");
  const otro = categorias.find((categoria) => categoria.slug === "otro");

  if (!normalizado) {
    const ordenadas = [...principales].sort(porNombre);
    return otro ? [...ordenadas, otro] : ordenadas;
  }

  const coincidencias = principales.filter((categoria) =>
    categoria.nombre.toLowerCase().includes(normalizado),
  );
  const resto = principales.filter((categoria) => !coincidencias.includes(categoria));
  const ordenadas = [...coincidencias.sort(porNombre), ...resto.sort(porNombre)];
  return otro ? [...ordenadas, otro] : ordenadas;
}

/** CL-02 · Publicar 1: que necesitas. Elegir categoria guarda en el borrador y avanza. */
export function QueNecesitasPage() {
  const navigate = useNavigate();
  const { borrador, actualizar } = useBorradorPedido();

  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKey,
    queryFn: obtenerCategorias,
    staleTime: Infinity,
  });

  const categoriasOrdenadas = useMemo(
    () =>
      categoriasQuery.data ? ordenarCategorias(categoriasQuery.data, borrador.queNecesitas) : [],
    [categoriasQuery.data, borrador.queNecesitas],
  );

  // docs/dominio.md §10: mide el embudo del asistente. Caso de uso valido de
  // useEffect (avisar a un sistema externo, no derivar estado ni pedir
  // datos): se dispara una sola vez al entrar a la primera pantalla.
  useEffect(() => {
    registrarEvento({ tipo: "asistente_iniciado" }).catch(() => undefined);
  }, []);

  function elegirCategoria(categoria: CategoriaVista) {
    // Las respuestas guia son especificas de la categoria (sus claves son las
    // preguntas de `categoria.preguntasGuia`): si el cliente vuelve atras y
    // cambia de categoria, las respuestas viejas quedan huerfanas y el
    // service las rechaza al publicar sin que la pantalla pueda mostrarlas
    // para borrarlas. Se resetean apenas cambia la categoria.
    if (categoria.id !== borrador.categoriaId) {
      actualizar({ categoriaId: categoria.id, respuestasGuia: {} });
    }
    registrarEvento({
      tipo: "asistente_paso_completado",
      categoriaId: categoria.id,
      paso: "que",
    }).catch(() => undefined);
    navigate("/publicar/problema");
  }

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <AsistenteHeader paso={1} titulo="¿Qué necesitás?" volverA="/" />

      <div className="flex flex-col gap-2">
        <label htmlFor="que-necesitas" className="text-sm font-medium text-slate-700">
          Contanos en pocas palabras
        </label>
        <input
          id="que-necesitas"
          type="text"
          value={borrador.queNecesitas}
          onChange={(evento) => actualizar({ queNecesitas: evento.target.value })}
          placeholder="Ej: se rompió una canilla"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-slate-700">Elegí la categoría que más se parece</p>

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

        {categoriasOrdenadas.length > 0 && (
          <CategoriasGrid
            categorias={categoriasOrdenadas}
            onSeleccionar={elegirCategoria}
            seleccionadaId={borrador.categoriaId}
            etiqueta="Categorías de oficios"
          />
        )}
      </div>
    </main>
  );
}
