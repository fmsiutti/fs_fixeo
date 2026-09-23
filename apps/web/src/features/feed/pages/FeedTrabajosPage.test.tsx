import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PedidoFeedItemVista,
  PedidoFeedPagina,
  PerfilProfesionalVistaPropia,
} from "@fixeo/shared";
import { FeedTrabajosPage } from "./FeedTrabajosPage";
import * as feedApi from "../api";
import * as perfilApi from "../../perfil/api";
import { ErrorApiHttp } from "../../../lib/http";

function perfilCompleto(
  overrides: Partial<PerfilProfesionalVistaPropia> = {},
): PerfilProfesionalVistaPropia {
  return {
    id: "perfil-1",
    presentacion: null,
    aniosExperiencia: null,
    estadoVerificacion: "aprobada",
    verificadoEn: new Date().toISOString(),
    pausado: false,
    tasaRespuesta: null,
    promedioResenias: null,
    cantidadResenias: 0,
    trabajosCerrados: 0,
    oficios: [
      {
        id: "oficio-1",
        categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
        subcategorias: [],
        matriculaNumero: null,
        matriculaEnte: null,
        matriculaEstado: "no_requerida",
        matriculaVenceEn: null,
      },
    ],
    zonaCobertura: { tipo: "barrios", barrioIds: ["barrio-1"] },
    verificaciones: [],
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function pedidoFeedItem(overrides: Partial<PedidoFeedItemVista> = {}): PedidoFeedItemVista {
  return {
    id: "pedido-1",
    categoria: { nombre: "Plomería", slug: "plomeria" },
    urgencia: "sin_apuro",
    barrio: { id: "barrio-1", nombre: "Palermo" },
    distanciaKm: null,
    cantidadPostulaciones: 0,
    tieneFotos: false,
    yaEligioAlguien: false,
    publicadoEn: new Date().toISOString(),
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function paginaFeed(overrides: Partial<PedidoFeedPagina> = {}): PedidoFeedPagina {
  return { items: [], cursor: null, verificacionAprobada: true, ...overrides };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/trabajos"]}>
        <FeedTrabajosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FeedTrabajosPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra las tarjetas cuando hay pedidos", async () => {
    vi.spyOn(perfilApi, "obtenerPerfilProfesional").mockResolvedValue(perfilCompleto());
    vi.spyOn(feedApi, "obtenerFeedTrabajos").mockResolvedValue(
      paginaFeed({ items: [pedidoFeedItem({ id: "pedido-1" })] }),
    );

    renderPage();

    expect(await screen.findByRole("link", { name: /plomería/i })).toBeInTheDocument();
  });

  it("muestra el vacio generico cuando no hay pedidos ni filtros activos", async () => {
    vi.spyOn(perfilApi, "obtenerPerfilProfesional").mockResolvedValue(perfilCompleto());
    vi.spyOn(feedApi, "obtenerFeedTrabajos").mockResolvedValue(paginaFeed());

    renderPage();

    expect(
      await screen.findByText(/todavía no hay pedidos que coincidan con tu zona y oficio/i),
    ).toBeInTheDocument();
  });

  it("muestra el vacio por filtros cuando hay filtros activos y no hay pedidos", async () => {
    vi.spyOn(perfilApi, "obtenerPerfilProfesional").mockResolvedValue(perfilCompleto());
    vi.spyOn(feedApi, "obtenerFeedTrabajos").mockImplementation((filtros) =>
      Promise.resolve(paginaFeed(filtros.urgencia ? {} : { items: [pedidoFeedItem()] })),
    );
    const usuario = userEvent.setup();

    renderPage();

    await screen.findByRole("link", { name: /plomería/i });

    await usuario.selectOptions(screen.getByLabelText(/urgencia/i), "emergencia");

    expect(
      await screen.findByText(/no encontramos pedidos con estos filtros/i),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /limpiar filtros/i }));

    expect(await screen.findByRole("link", { name: /plomería/i })).toBeInTheDocument();
  });

  it("invita a terminar el perfil cuando todavia no tiene oficios ni zona", async () => {
    vi.spyOn(perfilApi, "obtenerPerfilProfesional").mockRejectedValue(
      new ErrorApiHttp("no_encontrado", "No armaste tu perfil", 404),
    );
    vi.spyOn(feedApi, "obtenerFeedTrabajos").mockResolvedValue(paginaFeed());

    renderPage();

    expect(await screen.findByText(/terminá de armar tu perfil/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /armar mi perfil/i })).toBeInTheDocument();
  });

  it("muestra el banner de verificacion pendiente cuando corresponde", async () => {
    vi.spyOn(perfilApi, "obtenerPerfilProfesional").mockResolvedValue(
      perfilCompleto({ estadoVerificacion: "pendiente" }),
    );
    vi.spyOn(feedApi, "obtenerFeedTrabajos").mockResolvedValue(
      paginaFeed({ items: [pedidoFeedItem()], verificacionAprobada: false }),
    );

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/tu verificación está pendiente/i)).toBeInTheDocument(),
    );
  });
});
