import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsuarioVista } from "@fixeo/shared";
import { IngresarPage } from "./IngresarPage";
import { SesionContext, type SesionContextValor } from "../SesionContext";
import { ErrorApiHttp } from "../../../lib/http";
import * as api from "../api";

function usuarioDeEjemplo(overrides: Partial<UsuarioVista> = {}): UsuarioVista {
  return {
    id: "usuario-1",
    telefono: "+5491122334455",
    nombre: null,
    apellido: null,
    email: null,
    fotoUrl: null,
    rolActivo: null,
    estado: "activo",
    creadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function renderPage(sesionParcial: Partial<SesionContextValor> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const valorSesion: SesionContextValor = {
    usuario: null,
    estaAutenticado: false,
    cargando: false,
    confirmarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
    actualizarUsuario: vi.fn(),
    ...sesionParcial,
  };

  render(
    <QueryClientProvider client={queryClient}>
      <SesionContext.Provider value={valorSesion}>
        <MemoryRouter initialEntries={["/ingresar"]}>
          <Routes>
            <Route path="/ingresar" element={<IngresarPage />} />
            <Route path="/rol" element={<div>pantalla-rol</div>} />
            <Route path="/" element={<div>pantalla-inicio</div>} />
          </Routes>
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );

  return valorSesion;
}

async function enviarTelefono(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(screen.getByLabelText(/tu teléfono/i), "+5491122334455");
  await usuario.click(screen.getByRole("button", { name: /enviar código/i }));
}

describe("IngresarPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("deshabilita el reenvio los primeros 30 segundos y lo habilita despues", async () => {
    vi.spyOn(api, "solicitarOtp").mockResolvedValue(undefined);
    renderPage();

    // Con fake timers activos evitamos userEvent y findBy/waitFor (ambos hacen
    // esperas con setTimeout real, que queda congelado): disparamos los eventos
    // con fireEvent (sincronico) y envolvemos en act() para que React confirme
    // los estados/efectos encadenados (el contador reprograma su setTimeout en
    // cada tick) antes de leer el DOM.
    fireEvent.change(screen.getByLabelText(/tu teléfono/i), {
      target: { value: "+5491122334455" },
    });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enviar código/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    const botonReenviar = screen.getByRole("button", { name: /reenviar código en/i });
    expect(botonReenviar).toBeDisabled();

    // Avanzamos de a 1s (en vez de los 30s de una sola vez): el contador
    // reprograma su propio setTimeout dentro de un useEffect que necesita un
    // commit de React entre tick y tick para volver a suscribirse.
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    expect(screen.getByRole("button", { name: /^reenviar código$/i })).toBeEnabled();
  });

  it("muestra el texto esperado cuando el codigo es invalido", async () => {
    vi.spyOn(api, "solicitarOtp").mockResolvedValue(undefined);
    vi.spyOn(api, "confirmarOtp").mockRejectedValue(
      new ErrorApiHttp("otp_invalido", "El codigo es invalido o expiro", 401),
    );
    const usuario = userEvent.setup();
    renderPage();

    await enviarTelefono(usuario);
    await usuario.type(await screen.findByLabelText(/código de 6 dígitos/i), "000000");
    await usuario.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/código es incorrecto o venció/i);
  });

  it("muestra el mensaje del backend cuando se supera el limite de solicitudes", async () => {
    vi.spyOn(api, "solicitarOtp").mockRejectedValue(
      new ErrorApiHttp(
        "limite_excedido",
        "Demasiadas solicitudes de codigo para este telefono, esperá unos minutos",
        409,
      ),
    );
    const usuario = userEvent.setup();
    renderPage();

    await enviarTelefono(usuario);

    expect(await screen.findByRole("alert")).toHaveTextContent(/demasiadas solicitudes/i);
  });

  it("navega a /rol cuando el usuario confirmado no tiene rolActivo", async () => {
    vi.spyOn(api, "solicitarOtp").mockResolvedValue(undefined);
    vi.spyOn(api, "confirmarOtp").mockResolvedValue({
      accessToken: "token",
      usuario: usuarioDeEjemplo({ rolActivo: null }),
    });
    const usuario = userEvent.setup();
    renderPage();

    await enviarTelefono(usuario);
    await usuario.type(await screen.findByLabelText(/código de 6 dígitos/i), "123456");
    await usuario.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByText("pantalla-rol")).toBeInTheDocument();
  });

  it("navega a / cuando el usuario confirmado ya tiene rolActivo", async () => {
    vi.spyOn(api, "solicitarOtp").mockResolvedValue(undefined);
    vi.spyOn(api, "confirmarOtp").mockResolvedValue({
      accessToken: "token",
      usuario: usuarioDeEjemplo({ rolActivo: "cliente" }),
    });
    const usuario = userEvent.setup();
    renderPage();

    await enviarTelefono(usuario);
    await usuario.type(await screen.findByLabelText(/código de 6 dígitos/i), "123456");
    await usuario.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByText("pantalla-inicio")).toBeInTheDocument();
  });
});
