import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { useSesion } from "./features/auth/useSesion";
import { Spinner } from "./components/ui/Spinner";

/** Espera a que se resuelva el refresh silencioso antes de montar el router. */
export function App() {
  const { cargando } = useSesion();

  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <Spinner etiqueta="Cargando Fixeo" />
      </div>
    );
  }

  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-700 focus:px-4 focus:py-2 focus:text-white focus-visible:ring-2 focus-visible:ring-teal-900"
      >
        Saltar al contenido
      </a>
      <RouterProvider router={router} />
    </>
  );
}
