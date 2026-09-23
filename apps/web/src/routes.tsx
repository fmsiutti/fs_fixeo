import { createBrowserRouter } from "react-router-dom";
import { BienvenidaPage } from "./features/auth/pages/BienvenidaPage";
import { IngresarPage } from "./features/auth/pages/IngresarPage";
import { RolPage } from "./features/auth/pages/RolPage";
import { CuentaPage } from "./features/cuenta/pages/CuentaPage";
import { InicioPage } from "./features/pedidos/pages/InicioPage";
import { QueNecesitasPage } from "./features/pedidos/pages/QueNecesitasPage";
import { ProblemaPage } from "./features/pedidos/pages/ProblemaPage";
import { DondePage } from "./features/pedidos/pages/DondePage";
import { CuandoPage } from "./features/pedidos/pages/CuandoPage";
import { RevisarPage } from "./features/pedidos/pages/RevisarPage";
import { PedidoDetallePage } from "./features/pedidos/pages/PedidoDetallePage";
import { EditarPedidoPage } from "./features/pedidos/pages/EditarPedidoPage";
import { ArmarPerfilPage } from "./features/perfil/pages/ArmarPerfilPage";
import { MiPerfilPage } from "./features/perfil/pages/MiPerfilPage";
import { ColaVerificacionesPage } from "./features/admin/pages/ColaVerificacionesPage";
import { RutaConRol } from "./components/RutaConRol";

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
  {
    path: "/publicar/que",
    element: <QueNecesitasPage />,
  },
  {
    path: "/publicar/problema",
    element: <ProblemaPage />,
  },
  {
    path: "/publicar/donde",
    element: <DondePage />,
  },
  {
    path: "/publicar/cuando",
    element: <CuandoPage />,
  },
  {
    path: "/publicar/revisar",
    element: <RevisarPage />,
  },
  {
    path: "/pedidos/:id",
    element: <PedidoDetallePage />,
  },
  {
    path: "/pedidos/:id/editar",
    element: <EditarPedidoPage />,
  },
  {
    path: "/perfil/armar",
    element: (
      <RutaConRol roles={["profesional"]}>
        <ArmarPerfilPage />
      </RutaConRol>
    ),
  },
  {
    path: "/perfil",
    element: (
      <RutaConRol roles={["profesional"]}>
        <MiPerfilPage />
      </RutaConRol>
    ),
  },
  {
    path: "/admin/verificaciones",
    element: (
      <RutaConRol roles={["moderador", "soporte"]}>
        <ColaVerificacionesPage />
      </RutaConRol>
    ),
  },
]);
