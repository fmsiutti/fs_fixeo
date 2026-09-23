import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsuarioVista } from "@fixeo/shared";
import { CuentaPage } from "./CuentaPage";
import { SesionContext, type SesionContextValor } from "../../auth/SesionContext";
import * as cuentaApi from "../api";

function usuarioDeEjemplo(overrides: Partial<UsuarioVista> = {}): UsuarioVista {
  return {
    id: "usuario-1",
    telefono: "+5491100000040",
    nombre: "Ana",
    apellido: null,
    email: null,
    fotoUrl: null,
    rolActivo: null,
    estado: "activo",
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

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
          <CuentaPage />
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("CuentaPage - seccion de rol (CO-06)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin rol elegido, ofrece solo cliente o profesional, nunca moderador ni soporte", () => {
    renderConUsuario(usuarioDeEjemplo({ rolActivo: null }));

    expect(screen.getByRole("button", { name: /necesito un servicio/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /trabajo en oficios/i })).toBeInTheDocument();
    expect(screen.queryByText(/moderador/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/soporte/i)).not.toBeInTheDocument();
  });

  it("con rol cliente activo, solo ofrece cambiar a profesional", () => {
    renderConUsuario(usuarioDeEjemplo({ rolActivo: "cliente" }));

    expect(screen.getByRole("button", { name: /cambiar a profesional/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cambiar a moderador/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cambiar a soporte/i })).not.toBeInTheDocument();
  });

  it("al elegir un rol, llama a la api solo con cliente o profesional", async () => {
    vi.spyOn(cuentaApi, "cambiarRol").mockResolvedValue(
      usuarioDeEjemplo({ rolActivo: "profesional" }),
    );
    const usuario = userEvent.setup();
    renderConUsuario(usuarioDeEjemplo({ rolActivo: "cliente" }));

    await usuario.click(screen.getByRole("button", { name: /cambiar a profesional/i }));

    // TanStack Query v5 agrega un segundo argumento (contexto interno) a la
    // mutationFn: solo nos importa la variable de negocio que mandamos nosotros.
    expect(cuentaApi.cambiarRol).toHaveBeenCalledTimes(1);
    expect(cuentaApi.cambiarRol).toHaveBeenCalledWith({ rol: "profesional" }, expect.anything());
  });
});
