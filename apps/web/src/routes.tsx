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
import { ContactoPedidoPage } from "./features/pedidos/pages/ContactoPedidoPage";
import { CerrarPedidoPage } from "./features/pedidos/pages/CerrarPedidoPage";
import { ArmarPerfilPage } from "./features/perfil/pages/ArmarPerfilPage";
import { MiPerfilPage } from "./features/perfil/pages/MiPerfilPage";
import { ColaVerificacionesPage } from "./features/admin/pages/ColaVerificacionesPage";
import { ModeracionPedidosPage } from "./features/admin/pages/ModeracionPedidosPage";
import { UsuariosAdminPage } from "./features/admin/pages/UsuariosAdminPage";
import { UsuarioDetalleAdminPage } from "./features/admin/pages/UsuarioDetalleAdminPage";
import { CatalogoAdminPage } from "./features/admin/pages/CatalogoAdminPage";
import { TableroPage } from "./features/admin/pages/TableroPage";
import { FeedTrabajosPage } from "./features/feed/pages/FeedTrabajosPage";
import { FeedDetalleTrabajoPage } from "./features/feed/pages/FeedDetalleTrabajoPage";
import { PostularmePage } from "./features/postulaciones/pages/PostularmePage";
import { MisPostulacionesPage } from "./features/postulaciones/pages/MisPostulacionesPage";
import { TeEligieronPage } from "./features/postulaciones/pages/TeEligieronPage";
import { PerfilProfesionalPublicoPage } from "./features/profesionales/pages/PerfilProfesionalPublicoPage";
import { NoEncontradaPage } from "./features/comunes/pages/NoEncontradaPage";
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
    path: "/pedidos/:id/contacto",
    element: <ContactoPedidoPage />,
  },
  {
    path: "/pedidos/:id/cerrar",
    element: <CerrarPedidoPage />,
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
    path: "/trabajos",
    element: (
      <RutaConRol roles={["profesional"]}>
        <FeedTrabajosPage />
      </RutaConRol>
    ),
  },
  {
    path: "/trabajos/:id",
    element: (
      <RutaConRol roles={["profesional"]}>
        <FeedDetalleTrabajoPage />
      </RutaConRol>
    ),
  },
  {
    path: "/trabajos/:id/postularme",
    element: (
      <RutaConRol roles={["profesional"]}>
        <PostularmePage />
      </RutaConRol>
    ),
  },
  {
    path: "/postulaciones",
    element: (
      <RutaConRol roles={["profesional"]}>
        <MisPostulacionesPage />
      </RutaConRol>
    ),
  },
  {
    path: "/postulaciones/:id/elegido",
    element: (
      <RutaConRol roles={["profesional"]}>
        <TeEligieronPage />
      </RutaConRol>
    ),
  },
  {
    path: "/profesionales/:id",
    element: <PerfilProfesionalPublicoPage />,
  },
  {
    path: "/admin",
    element: (
      <RutaConRol roles={["moderador", "soporte"]}>
        <TableroPage />
      </RutaConRol>
    ),
  },
  {
    path: "/admin/pedidos",
    element: (
      <RutaConRol roles={["moderador", "soporte"]}>
        <ModeracionPedidosPage />
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
  {
    path: "/admin/usuarios",
    element: (
      <RutaConRol roles={["moderador", "soporte"]}>
        <UsuariosAdminPage />
      </RutaConRol>
    ),
  },
  {
    path: "/admin/usuarios/:id",
    element: (
      <RutaConRol roles={["moderador", "soporte"]}>
        <UsuarioDetalleAdminPage />
      </RutaConRol>
    ),
  },
  {
    path: "/admin/catalogo",
    element: (
      <RutaConRol roles={["moderador", "soporte"]}>
        <CatalogoAdminPage />
      </RutaConRol>
    ),
  },
  {
    path: "*",
    element: <NoEncontradaPage />,
  },
]);
