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

  return <RouterProvider router={router} />;
}
