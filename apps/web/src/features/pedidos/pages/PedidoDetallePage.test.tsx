import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PedidoVista, UsuarioVista } from "@fixeo/shared";
import { PedidoDetallePage } from "./PedidoDetallePage";
import { SesionContext, type SesionContextValor } from "../../auth/SesionContext";
import * as api from "../api";

function usuarioDeEjemplo(): UsuarioVista {
  return {
    id: "usuario-1",
    telefono: "+5491122334455",
    nombre: "Ana",
    apellido: null,
    email: null,
    fotoUrl: null,
    rolActivo: "cliente",
    estado: "activo",
    creadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  };
}

function pedidoDeEjemplo(overrides: Partial<PedidoVista> = {}): PedidoVista {
  return {
    id: "pedido-1",
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategoria: null,
    descripcion: "Se rompió la canilla de la cocina",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    direccion: {
      calle: "Av. Siempreviva",
      numero: "742",
      piso: null,
      depto: null,
      tipoPropiedad: "casa",
      lat: -34.6,
      lng: -58.4,
    },
    barrio: { id: "barrio-1", nombre: "Palermo" },
    estado: "publicado",
    publicadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    expiraEn: new Date("2026-01-08T00:00:00.000Z").toISOString(),
    fotos: [],
    vistas: 0,
    cantidadPostulaciones: 0,
    creadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function renderPage(pedido: PedidoVista) {
  vi.spyOn(api, "obtenerPedido").mockResolvedValue(pedido);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const valorSesion: SesionContextValor = {
    usuario: usuarioDeEjemplo(),
    estaAutenticado: true,
    cargando: false,
    confirmarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
    actualizarUsuario: vi.fn(),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <SesionContext.Provider value={valorSesion}>
        <MemoryRouter initialEntries={[`/pedidos/${pedido.id}`]}>
          <Routes>
            <Route path="/pedidos/:id" element={<PedidoDetallePage />} />
          </Routes>
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("PedidoDetallePage", () => {
  it("muestra el boton de cancelar cuando el pedido esta publicado", async () => {
    renderPage(pedidoDeEjemplo({ estado: "publicado" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancelar pedido/i })).toBeInTheDocument(),
    );
  });

  it("muestra el boton de cancelar cuando el pedido tiene postulaciones", async () => {
    renderPage(pedidoDeEjemplo({ estado: "con_postulaciones" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancelar pedido/i })).toBeInTheDocument(),
    );
  });

  // docs/dominio.md §3/§12: en_revision -> cancelado se agrego a proposito
  // (CL-07 ya decia "en revision: solo se puede cancelar"): sin esto, un
  // falso positivo del control automatico dejaba al cliente sin salida hasta
  // que exista moderacion.
  it("muestra solo el boton de cancelar (sin compartir ni contadores) cuando el pedido esta en revision", async () => {
    renderPage(pedidoDeEjemplo({ estado: "en_revision" }));

    await waitFor(() => expect(screen.getByText(/lo estamos revisando/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /cancelar pedido/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compartir/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/postulaciones/i)).not.toBeInTheDocument();
  });

  it("no muestra el boton de cancelar cuando el pedido ya esta cancelado", async () => {
    renderPage(pedidoDeEjemplo({ estado: "cancelado" }));

    await waitFor(() => expect(screen.getByText(/cancelaste este pedido/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /cancelar pedido/i })).not.toBeInTheDocument();
  });

  it("no muestra el boton de cancelar cuando el pedido esta contacto_habilitado (D5: ahi se declara el desenlace, no se cancela)", async () => {
    renderPage(pedidoDeEjemplo({ estado: "contacto_habilitado" }));

    await waitFor(() =>
      expect(screen.getByText(/estado: contacto habilitado/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /cancelar pedido/i })).not.toBeInTheDocument();
  });

  // docs/dominio.md §3: "el pedido solo se edita hasta la primera postulacion".
  it("muestra el link de editar cuando esta publicado sin postulaciones", async () => {
    renderPage(pedidoDeEjemplo({ estado: "publicado", cantidadPostulaciones: 0 }));

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /editar pedido/i })).toBeInTheDocument(),
    );
  });

  it("no muestra el link de editar en cuanto llega la primera postulacion", async () => {
    renderPage(pedidoDeEjemplo({ estado: "publicado", cantidadPostulaciones: 1 }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /cancelar pedido/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link", { name: /editar pedido/i })).not.toBeInTheDocument();
  });

  it("no muestra el link de editar cuando el pedido esta en revision", async () => {
    renderPage(pedidoDeEjemplo({ estado: "en_revision" }));

    await waitFor(() => expect(screen.getByText(/lo estamos revisando/i)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /editar pedido/i })).not.toBeInTheDocument();
  });
});
