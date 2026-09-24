import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BarrioVista, PerfilProfesionalVistaPublica, UsuarioVista } from "@fixeo/shared";
import { PerfilProfesionalPublicoPage } from "./PerfilProfesionalPublicoPage";
import { SesionContext, type SesionContextValor } from "../../auth/SesionContext";
import * as api from "../api";
import * as pedidosApi from "../../pedidos/api";
import * as feedApi from "../../feed/api";

const PERFIL_ID = "11111111-1111-4111-8111-111111111111";

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

function perfilDeEjemplo(
  overrides: Partial<PerfilProfesionalVistaPublica> = {},
): PerfilProfesionalVistaPublica {
  return {
    id: PERFIL_ID,
    nombre: "Juan",
    apellido: "Pérez",
    fotoUrl: null,
    presentacion: "Gasista matriculado con 10 años de experiencia",
    aniosExperiencia: 10,
    estadoVerificacion: "aprobada",
    promedioResenias: null,
    cantidadResenias: 0,
    trabajosCerrados: 0,
    oficios: [
      {
        categoria: { nombre: "Gas", slug: "gas" },
        subcategorias: ["Instalaciones"],
        matriculaEstado: "validada",
      },
    ],
    zonaCobertura: { tipo: "barrios", barrioIds: ["barrio-1"] },
    ...overrides,
  };
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
        <MemoryRouter initialEntries={[`/profesionales/${PERFIL_ID}`]}>
          <Routes>
            <Route path="/profesionales/:id" element={<PerfilProfesionalPublicoPage />} />
          </Routes>
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("PerfilProfesionalPublicoPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra 'Nuevo en Fixeo' cuando no tiene reseñas", async () => {
    vi.spyOn(api, "obtenerPerfilProfesionalPublico").mockResolvedValue(
      perfilDeEjemplo({ cantidadResenias: 0 }),
    );
    vi.spyOn(pedidosApi, "obtenerBarrios").mockResolvedValue([
      { id: "barrio-1", nombre: "Palermo" } as BarrioVista,
    ]);
    renderPage();

    expect(await screen.findByText(/nuevo en fixeo/i)).toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it("muestra el promedio y la cantidad de reseñas cuando ya tiene", async () => {
    vi.spyOn(api, "obtenerPerfilProfesionalPublico").mockResolvedValue(
      perfilDeEjemplo({ promedioResenias: 4.5, cantidadResenias: 12 }),
    );
    vi.spyOn(pedidosApi, "obtenerBarrios").mockResolvedValue([
      { id: "barrio-1", nombre: "Palermo" } as BarrioVista,
    ]);
    renderPage();

    expect(await screen.findByText(/4\.5/)).toBeInTheDocument();
    expect(screen.getByText(/12 reseñas/i)).toBeInTheDocument();
  });

  it("muestra la insignia de identidad verificada y de matricula validada por oficio", async () => {
    vi.spyOn(api, "obtenerPerfilProfesionalPublico").mockResolvedValue(perfilDeEjemplo());
    vi.spyOn(pedidosApi, "obtenerBarrios").mockResolvedValue([
      { id: "barrio-1", nombre: "Palermo" } as BarrioVista,
    ]);
    renderPage();

    expect(await screen.findByText(/identidad verificada/i)).toBeInTheDocument();
    expect(screen.getByText(/matrícula validada · gas/i)).toBeInTheDocument();
  });

  it("lista los barrios de la zona de cobertura", async () => {
    vi.spyOn(api, "obtenerPerfilProfesionalPublico").mockResolvedValue(perfilDeEjemplo());
    vi.spyOn(pedidosApi, "obtenerBarrios").mockResolvedValue([
      { id: "barrio-1", nombre: "Palermo" } as BarrioVista,
      { id: "barrio-2", nombre: "Belgrano" } as BarrioVista,
    ]);
    renderPage();

    expect(await screen.findByText("Palermo")).toBeInTheDocument();
    expect(screen.queryByText("Belgrano")).not.toBeInTheDocument();
  });

  it("permite denunciar el perfil", async () => {
    vi.spyOn(api, "obtenerPerfilProfesionalPublico").mockResolvedValue(perfilDeEjemplo());
    vi.spyOn(pedidosApi, "obtenerBarrios").mockResolvedValue([]);
    const denuncia = vi.spyOn(feedApi, "crearDenuncia").mockResolvedValue({ id: "denuncia-1" });
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("button", { name: /denunciar/i }));
    await usuario.selectOptions(screen.getByLabelText(/motivo/i), "Spam o publicidad");
    await usuario.click(screen.getByRole("button", { name: /^denunciar$/i }));

    await waitFor(() => expect(denuncia).toHaveBeenCalled());
    expect(denuncia.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ tipoObjeto: "perfil", objetoId: PERFIL_ID }),
    );
    expect(await screen.findByText(/recibimos tu denuncia/i)).toBeInTheDocument();
  });
});
