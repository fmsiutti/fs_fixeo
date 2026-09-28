import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificacionPagina, NotificacionVista, UsuarioVista } from "@fixeo/shared";
import { NotificacionesPage } from "./NotificacionesPage";
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

function notificacionDeEjemplo(overrides: Partial<NotificacionVista> = {}): NotificacionVista {
  return {
    id: "notif-1",
    tipo: "primera_postulacion",
    objetoId: "pedido-1",
    titulo: "Tenés una postulación nueva",
    cuerpo: "Un profesional se postuló a tu pedido.",
    ruta: "/pedidos/pedido-1",
    leidaEn: null,
    creadaEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function paginaDeEjemplo(overrides: Partial<NotificacionPagina> = {}): NotificacionPagina {
  return { items: [], cursor: null, ...overrides };
}

function renderPage() {
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
        <MemoryRouter initialEntries={["/notificaciones"]}>
          <Routes>
            <Route path="/notificaciones" element={<NotificacionesPage />} />
            <Route path="/pedidos/:id" element={<p>Detalle del pedido pedido-1</p>} />
          </Routes>
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("NotificacionesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra el estado vacio cuando no hay notificaciones", async () => {
    vi.spyOn(api, "obtenerNotificaciones").mockResolvedValue(paginaDeEjemplo());
    renderPage();

    expect(await screen.findByText(/no tenés notificaciones todavía/i)).toBeInTheDocument();
  });

  it("muestra un error con reintento si falla la carga", async () => {
    const mock = vi
      .spyOn(api, "obtenerNotificaciones")
      .mockRejectedValueOnce(new Error("fallo de red"))
      .mockResolvedValueOnce(paginaDeEjemplo({ items: [notificacionDeEjemplo()] }));
    const usuario = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos cargar/i);

    await usuario.click(screen.getByRole("button", { name: /reintentar/i }));

    expect(await screen.findByText(/tenés una postulación nueva/i)).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("tocar un item no leido dispara marcarNotificacionLeida", async () => {
    vi.spyOn(api, "obtenerNotificaciones").mockResolvedValue(
      paginaDeEjemplo({ items: [notificacionDeEjemplo({ leidaEn: null })] }),
    );
    const mutacion = vi.spyOn(api, "marcarNotificacionLeida").mockResolvedValue(undefined);
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("link", { name: /tenés una postulación nueva/i }));

    await waitFor(() => expect(mutacion).toHaveBeenCalledWith("notif-1", expect.anything()));
  });

  it("tocar un item ya leido no dispara marcarNotificacionLeida", async () => {
    vi.spyOn(api, "obtenerNotificaciones").mockResolvedValue(
      paginaDeEjemplo({
        items: [notificacionDeEjemplo({ leidaEn: "2026-01-02T00:00:00.000Z" })],
      }),
    );
    const mutacion = vi.spyOn(api, "marcarNotificacionLeida").mockResolvedValue(undefined);
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("link", { name: /tenés una postulación nueva/i }));

    expect(mutacion).not.toHaveBeenCalled();
  });

  it("el link navega a item.ruta", async () => {
    vi.spyOn(api, "obtenerNotificaciones").mockResolvedValue(
      paginaDeEjemplo({ items: [notificacionDeEjemplo({ ruta: "/pedidos/pedido-1" })] }),
    );
    vi.spyOn(api, "marcarNotificacionLeida").mockResolvedValue(undefined);
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("link", { name: /tenés una postulación nueva/i }));

    expect(await screen.findByText("Detalle del pedido pedido-1")).toBeInTheDocument();
  });
});
