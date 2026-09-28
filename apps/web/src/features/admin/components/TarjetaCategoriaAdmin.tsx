import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  EXIGENCIAS_MATRICULA,
  type CategoriaAdminVista,
  type ExigenciaMatricula,
} from "@fixeo/shared";
import { categoriasAdminQueryKey, editarCategoriaAdmin } from "../api";
import { ETIQUETAS_EXIGENCIA_MATRICULA } from "../etiquetas";
import { parsearLineas } from "../lib/texto";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp } from "../../../lib/http";

interface TarjetaCategoriaAdminProps {
  categoria: CategoriaAdminVista;
  puedeEscribir: boolean;
}

/** AD-04 · una categoria del catalogo, con activar/desactivar y edicion inline. */
export function TarjetaCategoriaAdmin({ categoria, puedeEscribir }: TarjetaCategoriaAdminProps) {
  const queryClient = useQueryClient();
  const [mostrarEdicion, setMostrarEdicion] = useState(false);
  const [nombre, setNombre] = useState(categoria.nombre);
  const [subcategoriasTexto, setSubcategoriasTexto] = useState(categoria.subcategorias.join("\n"));
  const [preguntasGuiaTexto, setPreguntasGuiaTexto] = useState(categoria.preguntasGuia.join("\n"));
  const [requiereMatricula, setRequiereMatricula] = useState<ExigenciaMatricula>(
    categoria.requiereMatricula,
  );
  const [error, setError] = useState<string | null>(null);

  function invalidar() {
    return queryClient.invalidateQueries({ queryKey: categoriasAdminQueryKey });
  }

  const mutacionToggle = useMutation({
    mutationFn: editarCategoriaAdmin,
    onSuccess: () => void invalidar(),
  });

  const mutacionEditar = useMutation({
    mutationFn: editarCategoriaAdmin,
    onSuccess: () => {
      setMostrarEdicion(false);
      void invalidar();
    },
    onError: (err) =>
      setError(err instanceof ErrorApiHttp ? err.mensaje : "No pudimos guardar la categoría."),
  });

  function guardarEdicion() {
    if (!nombre.trim()) {
      setError("Falta el nombre");
      return;
    }
    setError(null);
    mutacionEditar.mutate({
      id: categoria.id,
      datos: {
        nombre: nombre.trim(),
        subcategorias: parsearLineas(subcategoriasTexto),
        preguntasGuia: parsearLineas(preguntasGuiaTexto),
        requiereMatricula,
      },
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{categoria.nombre}</span>
        <Badge tono={categoria.activa ? "exito" : "neutro"}>
          {categoria.activa ? "Activa" : "Inactiva"}
        </Badge>
      </div>
      <p className="text-xs text-slate-500">slug: {categoria.slug}</p>
      <p className="text-sm text-slate-700">
        {ETIQUETAS_EXIGENCIA_MATRICULA[categoria.requiereMatricula]}
      </p>
      {categoria.subcategorias.length > 0 && (
        <p className="text-sm text-slate-600">
          Subcategorías: {categoria.subcategorias.join(", ")}
        </p>
      )}
      {categoria.preguntasGuia.length > 0 && (
        <p className="text-sm text-slate-600">
          Preguntas guía: {categoria.preguntasGuia.join(" · ")}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {puedeEscribir && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <Button
              type="button"
              variante="secundario"
              cargando={mutacionToggle.isPending}
              onClick={() =>
                mutacionToggle.mutate({
                  id: categoria.id,
                  datos: { activa: !categoria.activa },
                })
              }
            >
              {categoria.activa ? "Desactivar" : "Activar"}
            </Button>
            <Button
              type="button"
              variante="secundario"
              onClick={() => setMostrarEdicion((v) => !v)}
            >
              {mostrarEdicion ? "Cerrar edición" : "Editar"}
            </Button>
          </div>

          {mostrarEdicion && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`nombre-categoria-${categoria.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Nombre
                </label>
                <input
                  id={`nombre-categoria-${categoria.id}`}
                  type="text"
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`matricula-categoria-${categoria.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Exigencia de matrícula
                </label>
                <select
                  id={`matricula-categoria-${categoria.id}`}
                  value={requiereMatricula}
                  onChange={(evento) =>
                    setRequiereMatricula(evento.target.value as ExigenciaMatricula)
                  }
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
                  htmlFor={`subcategorias-${categoria.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Subcategorías (una por renglón)
                </label>
                <textarea
                  id={`subcategorias-${categoria.id}`}
                  rows={3}
                  value={subcategoriasTexto}
                  onChange={(evento) => setSubcategoriasTexto(evento.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`preguntas-${categoria.id}`}
                  className="text-sm font-medium text-slate-700"
                >
                  Preguntas guía (una por renglón)
                </label>
                <textarea
                  id={`preguntas-${categoria.id}`}
                  rows={3}
                  value={preguntasGuiaTexto}
                  onChange={(evento) => setPreguntasGuiaTexto(evento.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <Button type="button" cargando={mutacionEditar.isPending} onClick={guardarEdicion}>
                Guardar cambios
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
