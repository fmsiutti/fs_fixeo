import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PedidoVistaProfesional } from "@fixeo/shared";
import { FeedDetalleTrabajoPage } from "./FeedDetalleTrabajoPage";
import * as feedApi from "../api";
import { ErrorApiHttp } from "../../../lib/http";

function pedidoDetalle(overrides: Partial<PedidoVistaProfesional> = {}): PedidoVistaProfesional {
  return {
    id: "pedido-1",
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategoria: null,
    descripcion: "Se rompió la canilla de la cocina",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    barrio: { id: "barrio-1", nombre: "Palermo" },
    distanciaKm: 2.3,
    fotos: [],
    estado: "publicado",
    cliente: { nombre: "Ana" },
    cantidadPostulaciones: 1,
    postulacionesCupoLleno: false,
    yaEligioAlguien: false,
    seleccionablesLibres: 3,
    verificacionAprobada: true,
    publicadoEn: new Date().toISOString(),
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/trabajos/pedido-1"]}>
        <Routes>
          <Route path="/trabajos/:id" element={<FeedDetalleTrabajoPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FeedDetalleTrabajoPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra el detalle del pedido", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(pedidoDetalle());

    renderPage();

    expect(await screen.findByText(/se rompió la canilla de la cocina/i)).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /postularme/i })).toHaveAttribute(
      "href",
      "/trabajos/pedido-1/postularme",
    );
  });

  it("deshabilita postularme con el motivo cuando el cupo esta lleno", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(
      pedidoDetalle({ postulacionesCupoLleno: true }),
    );

    renderPage();

    expect(
      await screen.findByText(/se alcanzó el máximo de postulaciones para este pedido/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^postularme$/i })).not.toBeInTheDocument();
  });

  it("deshabilita postularme con el motivo cuando la verificacion esta pendiente", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(
      pedidoDetalle({ verificacionAprobada: false }),
    );

    renderPage();

    expect(
      await screen.findByText(
        /todavía no podés postularte: tu verificación está pendiente de aprobación/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^postularme$/i })).not.toBeInTheDocument();
  });

  it("prioriza el motivo de verificacion pendiente sobre el cupo lleno", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(
      pedidoDetalle({ verificacionAprobada: false, postulacionesCupoLleno: true }),
    );

    renderPage();

    expect(
      await screen.findByText(
        /todavía no podés postularte: tu verificación está pendiente de aprobación/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/se alcanzó el máximo de postulaciones para este pedido/i),
    ).not.toBeInTheDocument();
  });

  it("muestra el aviso de D2 cuando ya eligieron a alguien y queda cupo", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(
      pedidoDetalle({ yaEligioAlguien: true, seleccionablesLibres: 2 }),
    );

    renderPage();

    expect(
      await screen.findByText(/el cliente ya eligió a un profesional, todavía quedan 2 lugares/i),
    ).toBeInTheDocument();
  });

  it("muestra el mensaje de conflicto y vuelve al feed sin redirigir automaticamente", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockRejectedValue(
      new ErrorApiHttp("conflicto", "El cliente ya completó su elección", 409),
    );

    renderPage();

    expect(await screen.findByText(/el cliente ya completó su elección/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al feed" })).toHaveAttribute(
      "href",
      "/trabajos",
    );
  });

  it("muestra un mensaje generico y volver al feed cuando el pedido no existe (404)", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockRejectedValue(
      new ErrorApiHttp("no_encontrado", "El pedido no existe", 404),
    );

    renderPage();

    expect(await screen.findByText(/este pedido ya no está disponible/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al feed" })).toHaveAttribute(
      "href",
      "/trabajos",
    );
  });
});
