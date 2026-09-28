import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsuarioVista } from "@fixeo/shared";
import { CuentaPage } from "./CuentaPage";
import { SesionContext, type SesionContextValor } from "../../auth/SesionContext";
import * as cuentaApi from "../api";
import * as authApi from "../../auth/api";
import * as notificacionesApi from "../../notificaciones/api";

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

describe("CuentaPage - cerrar sesion desuscribe el push (dispositivo compartido)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- limpieza del global que cada test define
    delete navigator.serviceWorker;
    // @ts-expect-error -- idem
    delete window.PushManager;
  });

  it("desuscribe el push del navegador antes de cerrar sesion cuando hay una suscripcion activa", async () => {
    Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
    const unsubscribe = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi
              .fn()
              .mockResolvedValue({ endpoint: "https://push.example/1", unsubscribe }),
          },
        }),
      },
      configurable: true,
    });
    const desuscribir = vi.spyOn(notificacionesApi, "desuscribirPush").mockResolvedValue(undefined);
    const cerrarSesionApi = vi.spyOn(authApi, "cerrarSesionApi").mockResolvedValue(undefined);
    const cerrarSesion = vi.fn();
    const usuario = userEvent.setup();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <SesionContext.Provider
          value={{
            usuario: usuarioDeEjemplo(),
            estaAutenticado: true,
            cargando: false,
            confirmarSesion: vi.fn(),
            cerrarSesion,
            actualizarUsuario: vi.fn(),
          }}
        >
          <MemoryRouter>
            <CuentaPage />
          </MemoryRouter>
        </SesionContext.Provider>
      </QueryClientProvider>,
    );

    await usuario.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(unsubscribe).toHaveBeenCalled();
    expect(desuscribir).toHaveBeenCalledWith({ endpoint: "https://push.example/1" });
    expect(cerrarSesionApi).toHaveBeenCalled();
    // el push se desuscribe (y la api de logout se llama) antes de limpiar la sesion local
    expect(desuscribir.mock.invocationCallOrder[0]).toBeLessThan(
      cerrarSesion.mock.invocationCallOrder[0]!,
    );
    expect(cerrarSesion).toHaveBeenCalled();
  });

  it("cierra sesion igual si desuscribir el push falla (best-effort, nunca bloquea el logout)", async () => {
    Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockRejectedValue(new Error("sin soporte")),
          },
        }),
      },
      configurable: true,
    });
    const cerrarSesionApi = vi.spyOn(authApi, "cerrarSesionApi").mockResolvedValue(undefined);
    const cerrarSesion = vi.fn();
    const usuario = userEvent.setup();

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <SesionContext.Provider
          value={{
            usuario: usuarioDeEjemplo(),
            estaAutenticado: true,
            cargando: false,
            confirmarSesion: vi.fn(),
            cerrarSesion,
            actualizarUsuario: vi.fn(),
          }}
        >
          <MemoryRouter>
            <CuentaPage />
          </MemoryRouter>
        </SesionContext.Provider>
      </QueryClientProvider>,
    );

    await usuario.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(cerrarSesionApi).toHaveBeenCalled();
    expect(cerrarSesion).toHaveBeenCalled();
  });
});
