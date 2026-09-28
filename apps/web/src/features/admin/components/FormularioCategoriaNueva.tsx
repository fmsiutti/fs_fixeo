import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EXIGENCIAS_MATRICULA, type ExigenciaMatricula } from "@fixeo/shared";
import { categoriasAdminQueryKey, crearCategoriaAdmin } from "../api";
import { ETIQUETAS_EXIGENCIA_MATRICULA } from "../etiquetas";
import { parsearLineas } from "../lib/texto";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp } from "../../../lib/http";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** AD-04 · alta de una categoria nueva del catalogo. */
export function FormularioCategoriaNueva() {
  const queryClient = useQueryClient();
  const [mostrar, setMostrar] = useState(false);
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [subcategoriasTexto, setSubcategoriasTexto] = useState("");
  const [preguntasGuiaTexto, setPreguntasGuiaTexto] = useState("");
  const [requiereMatricula, setRequiereMatricula] = useState<ExigenciaMatricula>("no_exigida");
  const [error, setError] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: crearCategoriaAdmin,
    onSuccess: () => {
      setMostrar(false);
      setNombre("");
      setSlug("");
      setSubcategoriasTexto("");
      setPreguntasGuiaTexto("");
      setRequiereMatricula("no_exigida");
      void queryClient.invalidateQueries({ queryKey: categoriasAdminQueryKey });
    },
    onError: (err) =>
      setError(err instanceof ErrorApiHttp ? err.mensaje : "No pudimos crear la categoría."),
  });

  function crear() {
    if (!nombre.trim()) {
      setError("Falta el nombre");
      return;
    }
    if (!SLUG_REGEX.test(slug.trim())) {
      setError("El slug debe ser kebab-case (minúsculas, números y guiones)");
      return;
    }
    setError(null);
    mutacion.mutate({
      nombre: nombre.trim(),
      slug: slug.trim(),
      subcategorias: parsearLineas(subcategoriasTexto),
      preguntasGuia: parsearLineas(preguntasGuiaTexto),
      requiereMatricula,
    });
  }

  if (!mostrar) {
    return (
      <Button type="button" variante="secundario" onClick={() => setMostrar(true)}>
        Nueva categoría
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
      <h3 className="font-semibold text-slate-900">Nueva categoría</h3>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nueva-categoria-nombre" className="text-sm font-medium text-slate-700">
          Nombre
        </label>
        <input
          id="nueva-categoria-nombre"
          type="text"
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nueva-categoria-slug" className="text-sm font-medium text-slate-700">
          Slug (kebab-case)
        </label>
        <input
          id="nueva-categoria-slug"
          type="text"
          value={slug}
          onChange={(evento) => setSlug(evento.target.value)}
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nueva-categoria-matricula" className="text-sm font-medium text-slate-700">
          Exigencia de matrícula
        </label>
        <select
          id="nueva-categoria-matricula"
          value={requiereMatricula}
          onChange={(evento) => setRequiereMatricula(evento.target.value as ExigenciaMatricula)}
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
        >
          {EXIGENCIAS_MATRICULA.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETAS_EXIGENCIA_MATRICULA[valor]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="nueva-categoria-subcategorias"
          className="text-sm font-medium text-slate-700"
        >
          Subcategorías (una por renglón, opcional)
        </label>
        <textarea
          id="nueva-categoria-subcategorias"
          rows={3}
          value={subcategoriasTexto}
          onChange={(evento) => setSubcategoriasTexto(evento.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="nueva-categoria-preguntas" className="text-sm font-medium text-slate-700">
          Preguntas guía (una por renglón, opcional)
        </label>
        <textarea
          id="nueva-categoria-preguntas"
          rows={3}
          value={preguntasGuiaTexto}
          onChange={(evento) => setPreguntasGuiaTexto(evento.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variante="secundario" onClick={() => setMostrar(false)}>
          Cancelar
        </Button>
        <Button type="button" cargando={mutacion.isPending} onClick={crear}>
          Crear categoría
        </Button>
      </div>
    </div>
  );
}
