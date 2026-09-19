import { createBrowserRouter } from "react-router-dom";
import { InicioPage } from "./features/salud/pages/InicioPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <InicioPage />,
  },
]);
