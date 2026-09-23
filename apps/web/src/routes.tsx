import { createBrowserRouter } from "react-router-dom";
import { InicioPage } from "./features/salud/pages/InicioPage";
import { BienvenidaPage } from "./features/auth/pages/BienvenidaPage";
import { IngresarPage } from "./features/auth/pages/IngresarPage";
import { RolPage } from "./features/auth/pages/RolPage";
import { CuentaPage } from "./features/cuenta/pages/CuentaPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <InicioPage />,
  },
  {
    path: "/bienvenida",
    element: <BienvenidaPage />,
  },
  {
    path: "/ingresar",
    element: <IngresarPage />,
  },
  {
    path: "/rol",
    element: <RolPage />,
  },
  {
    path: "/cuenta",
    element: <CuentaPage />,
  },
]);
