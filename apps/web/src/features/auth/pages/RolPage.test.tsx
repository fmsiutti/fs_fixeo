import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { UsuarioVista } from "@fixeo/shared";
import { RolPage } from "./RolPage";
import { SesionContext, type SesionContextValor } from "../SesionContext";

function renderConUsuario(usuario: UsuarioVista) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const valorSesion: SesionContextValor = {
    usuario,
    estaAutenticado: true,
    cargando: false,
    confirmarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
    actualizarUsuario: vi.fn(),
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <SesionContext.Provider value={valorSesion}>
        <MemoryRouter>
          <RolPage />
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("RolPage", () => {
  it("solo ofrece elegir cliente o profesional, nunca moderador ni soporte", () => {
    renderConUsuario({
      id: "usuario-1",
      telefono: "+5491100000030",
      nombre: null,
      apellido: null,
      email: null,
      fotoUrl: null,
      rolActivo: null,
      estado: "activo",
      creadoEn: new Date().toISOString(),
    });

    const grupo = screen.getByRole("group", { name: /elegí tu rol/i });
    const botones = within(grupo).getAllByRole("button");

    expect(botones).toHaveLength(2);
    expect(screen.queryByText(/moderador/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/soporte/i)).not.toBeInTheDocument();
  });
});
