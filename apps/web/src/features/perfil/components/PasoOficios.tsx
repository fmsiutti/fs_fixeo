import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  guardarOficiosSchema,
  type CategoriaVista,
  type GuardarOficios,
  type PerfilProfesionalVistaPropia,
} from "@fixeo/shared";
import { categoriasQueryKey, obtenerCategorias } from "../../pedidos/api";
import { guardarOficios } from "../api";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";
import { ETIQUETAS_EXIGENCIA_MATRICULA } from "../etiquetas";

const MAX_OFICIOS = 8;

interface PasoOficiosProps {
  perfil: PerfilProfesionalVistaPropia;
  onExito: (perfil: PerfilProfesionalVistaPropia) => void;
}

/** PR-01 · paso "Oficios". Reemplaza el set completo (PUT), por eso se precarga desde `perfil.oficios`. */
export function PasoOficios({ perfil, onExito }: PasoOficiosProps) {
  const [seleccion, setSeleccion] = useState<Map<string, Set<string>>>(
    () =>
      new Map(perfil.oficios.map((oficio) => [oficio.categoria.id, new Set(oficio.subcategorias)])),
  );
  const [error, setError] = useState<string | null>(null);

  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKey,
    queryFn: obtenerCategorias,
    staleTime: Infinity,
  });

  const mutacion = useMutation({
    mutationFn: guardarOficios,
    onSuccess: onExito,
    onError: (err) =>
      setError(
        err instanceof ErrorApiHttp
          ? err.mensaje
          : "No pudimos guardar tus oficios. Probá de nuevo.",
      ),
  });

  function toggleCategoria(categoria: CategoriaVista) {
    setSeleccion((actual) => {
      const nuevo = new Map(actual);
      if (nuevo.has(categoria.id)) {
        nuevo.delete(categoria.id);
      } else if (nuevo.size < MAX_OFICIOS) {
        nuevo.set(categoria.id, new Set());
      }
      return nuevo;
    });
  }

  function toggleSubcategoria(categoriaId: string, subcategoria: string) {
    setSeleccion((actual) => {
      const nuevo = new Map(actual);
      const subs = new Set(nuevo.get(categoriaId) ?? []);
      if (subs.has(subcategoria)) {
        subs.delete(subcategoria);
      } else {
        subs.add(subcategoria);
      }
      nuevo.set(categoriaId, subs);
      return nuevo;
    });
  }

  function enviar() {
    const datos: GuardarOficios = {
      oficios: Array.from(seleccion.entries()).map(([categoriaId, subs]) => ({
        categoriaId,
        subcategorias: Array.from(subs),
      })),
    };
    const resultado = guardarOficiosSchema.safeParse(datos);
    if (!resultado.success) {
      setError(resultado.error.issues[0]?.message ?? "Revisá los oficios elegidos");
      return;
    }
    setError(null);
    mutacion.mutate(resultado.data);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-600">
        Elegí hasta {MAX_OFICIOS} categorías en las que trabajás.
      </p>

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
        <div className="flex flex-col gap-3">
          {categoriasQuery.data.map((categoria) => {
            const activa = seleccion.has(categoria.id);
            return (
              <div
                key={categoria.id}
                className={`flex flex-col gap-2 rounded-xl border p-3 ${
                  activa ? "border-teal-700 bg-teal-50" : "border-slate-200"
                }`}
              >
                <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={activa}
                    onChange={() => toggleCategoria(categoria)}
                    disabled={!activa && seleccion.size >= MAX_OFICIOS}
                    className="h-5 w-5"
                  />
                  {categoria.nombre}
                  {categoria.requiereMatricula !== "no_exigida" && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        categoria.requiereMatricula === "obligatoria"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {ETIQUETAS_EXIGENCIA_MATRICULA[categoria.requiereMatricula]}
                    </span>
                  )}
                </label>

                {activa && categoria.subcategorias.length > 0 && (
                  <div className="ml-7 flex flex-wrap gap-2">
                    {categoria.subcategorias.map((sub) => {
                      const marcada = seleccion.get(categoria.id)?.has(sub) ?? false;
                      return (
                        <label
                          key={sub}
                          className="flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 px-3 text-xs font-medium text-slate-700 has-[:checked]:border-teal-700 has-[:checked]:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={marcada}
                            onChange={() => toggleSubcategoria(categoria.id, sub)}
                            className="h-3.5 w-3.5"
                          />
                          {sub}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button
        type="button"
        onClick={enviar}
        disabled={seleccion.size === 0}
        cargando={mutacion.isPending}
      >
        Continuar
      </Button>
    </div>
  );
}
