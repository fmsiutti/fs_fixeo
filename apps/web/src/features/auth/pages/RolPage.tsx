import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { CambiarRol } from "@fixeo/shared";
import { useSesion } from "../useSesion";
import { useCambiarRol } from "../../cuenta/hooks/useCambiarRol";
import { ErrorApiHttp } from "../../../lib/http";

const OPCIONES: Array<{ rol: CambiarRol["rol"]; titulo: string; descripcion: string }> = [
  {
    rol: "cliente",
    titulo: "Necesito un servicio",
    descripcion: "Publicá lo que tenés que arreglar y recibí postulaciones de profesionales.",
  },
  {
    rol: "profesional",
    titulo: "Trabajo en oficios",
    descripcion: "Mirá pedidos cerca tuyo y postulate con tu estimación.",
  },
];

/** CO-03 · Elegí tu rol. Reversible: tambien se puede cambiar desde CO-06 (Mi cuenta). */
export function RolPage() {
  const { usuario, actualizarUsuario } = useSesion();
  const navigate = useNavigate();
  const mutacion = useCambiarRol();
  const [error, setError] = useState<string | null>(null);

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }

  function elegir(rol: CambiarRol["rol"]) {
    setError(null);
    mutacion.mutate(
      { rol },
      {
        onSuccess: (usuarioActualizado) => {
          actualizarUsuario(usuarioActualizado);
          navigate("/", { replace: true });
        },
        onError: (err) => {
          setError(
            err instanceof ErrorApiHttp
              ? err.mensaje
              : "No pudimos guardar tu elección. Probá de nuevo.",
          );
        },
      },
    );
  }

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-10">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold text-teal-800">Elegí tu rol</h1>
        <p className="text-sm text-slate-600">Podés cambiarlo cuando quieras desde Mi cuenta.</p>
      </header>

      <div className="flex flex-col gap-4" role="group" aria-label="Elegí tu rol">
        {OPCIONES.map((opcion) => (
          <button
            key={opcion.rol}
            type="button"
            onClick={() => elegir(opcion.rol)}
            disabled={mutacion.isPending}
            className="flex min-h-11 flex-col gap-1 rounded-2xl border border-slate-200 p-5 text-left transition hover:border-teal-600 hover:bg-teal-50 disabled:opacity-60"
          >
            <span className="text-lg font-semibold text-slate-900">{opcion.titulo}</span>
            <span className="text-sm text-slate-600">{opcion.descripcion}</span>
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </main>
  );
}
