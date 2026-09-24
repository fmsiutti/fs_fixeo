import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactoVistaProfesional } from "@fixeo/shared";
import { TeEligieronPage } from "./TeEligieronPage";
import * as api from "../api";
import { ErrorApiHttp } from "../../../lib/http";

const useNavigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...real, useNavigate: () => useNavigateMock };
});

const POSTULACION_ID = "postulacion-1";

function contactoDeEjemplo(
  overrides: Partial<ContactoVistaProfesional> = {},
): ContactoVistaProfesional {
  return {
    id: "contacto-1",
    pedido: {
      id: "pedido-1",
      categoria: { nombre: "Plomería", slug: "plomeria" },
      descripcion: "Se rompió la canilla de la cocina",
      urgencia: "sin_apuro",
      franjas: ["manana"],
    },
    cliente: {
      nombre: "Ana",
      apellido: "Gómez",
      telefono: "+5491122334455",
      direccion: {
        calle: "Av. Siempreviva",
        numero: "742",
        piso: null,
        depto: null,
        lat: -34.6,
        lng: -58.4,
      },
      barrio: { nombre: "Palermo" },
    },
    hayOtrosElegidos: false,
    estadoPostulacion: "seleccionada",
    habilitadoEn: new Date("2026-01-03T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/postulaciones/${POSTULACION_ID}/elegido`]}>
        <Routes>
          <Route path="/postulaciones/:id/elegido" element={<TeEligieronPage />} />
          <Route path="/postulaciones" element={<p>Mis postulaciones</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TeEligieronPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useNavigateMock.mockClear();
  });

  it("muestra el spinner mientras carga", () => {
    vi.spyOn(api, "obtenerContactoElegido").mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText(/cargando el contacto/i)).toBeInTheDocument();
  });

  it("muestra el error y permite reintentar", async () => {
    const mock = vi
      .spyOn(api, "obtenerContactoElegido")
      .mockRejectedValue(new ErrorApiHttp("no_encontrado", "No encontramos este contacto", 404));
    const usuario = userEvent.setup();

    renderPage();

    expect(await screen.findByText(/no encontramos este contacto/i)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });

  it("muestra nombre completo, direccion exacta y telefono del cliente", async () => {
    vi.spyOn(api, "obtenerContactoElegido").mockResolvedValue(contactoDeEjemplo());

    renderPage();

    expect(await screen.findByText(/ana gómez/i)).toBeInTheDocument();
    expect(screen.getByText(/av\. siempreviva 742, palermo/i)).toBeInTheDocument();
    expect(screen.getByText(/\+5491122334455/)).toBeInTheDocument();
  });

  it("el boton como llegar apunta a google maps con lat y lng del cliente", async () => {
    vi.spyOn(api, "obtenerContactoElegido").mockResolvedValue(contactoDeEjemplo());

    renderPage();

    const link = await screen.findByRole("link", { name: /cómo llegar/i });
    expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=-34.6,-58.4",
    );
  });

  it("avisa cuando el cliente eligio a otros profesionales", async () => {
    vi.spyOn(api, "obtenerContactoElegido").mockResolvedValue(
      contactoDeEjemplo({ hayOtrosElegidos: true }),
    );

    renderPage();

    expect(
      await screen.findByText(/el cliente también eligió a otros profesionales/i),
    ).toBeInTheDocument();
  });

  it("no avisa de otros elegidos cuando hayOtrosElegidos es false", async () => {
    vi.spyOn(api, "obtenerContactoElegido").mockResolvedValue(
      contactoDeEjemplo({ hayOtrosElegidos: false }),
    );

    renderPage();

    await screen.findByText(/ana gómez/i);
    expect(
      screen.queryByText(/el cliente también eligió a otros profesionales/i),
    ).not.toBeInTheDocument();
  });

  it("confirma y avisa que no puede tomarlo, invalida las queries y navega a mis postulaciones", async () => {
    vi.spyOn(api, "obtenerContactoElegido").mockResolvedValue(contactoDeEjemplo());
    const mockNoPuedo = vi.spyOn(api, "noPuedoTomarloPostulacion").mockResolvedValue({} as never);
    const usuario = userEvent.setup();

    renderPage();

    await usuario.click(await screen.findByRole("button", { name: /no puedo tomarlo/i }));
    await usuario.click(screen.getByRole("button", { name: /sí, no puedo tomarlo/i }));

    await waitFor(() => expect(mockNoPuedo).toHaveBeenCalledWith(POSTULACION_ID));
    await waitFor(() => expect(useNavigateMock).toHaveBeenCalledWith("/postulaciones"));
  });

  it("cuando la postulacion esta retirada, muestra el aviso y no vuelve a ofrecer el boton no puedo tomarlo", async () => {
    vi.spyOn(api, "obtenerContactoElegido").mockResolvedValue(
      contactoDeEjemplo({ estadoPostulacion: "retirada" }),
    );

    renderPage();

    expect(
      await screen.findByText(/ya le avisaste al cliente que no podés tomar este trabajo/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /no puedo tomarlo/i })).not.toBeInTheDocument();
  });
});
