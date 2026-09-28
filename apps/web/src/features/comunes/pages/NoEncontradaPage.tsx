import { Link } from "react-router-dom";
import { clasesBoton } from "../../../components/ui/clasesBoton";

/** Catch-all de rutas: cualquier URL sin match cae aca en vez del error crudo de React Router. */
export function NoEncontradaPage() {
  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 py-8 text-center">
      <h1 className="text-xl font-bold text-teal-800">Esta página no existe</h1>
      <p className="text-sm text-slate-600">
        Puede que el link esté roto o que la sección todavía no esté disponible.
      </p>
      <Link to="/" className={clasesBoton("primario", "w-auto px-6")}>
        Volver al inicio
      </Link>
    </main>
  );
}
