import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostulacionesPagina, PostulacionVistaProfesional } from "@fixeo/shared";
import { MisPostulacionesPage } from "./MisPostulacionesPage";
import * as api from "../api";
import { ErrorApiHttp } from "../../../lib/http";

function postulacionDeEjemplo(
  overrides: Partial<PostulacionVistaProfesional> = {},
): PostulacionVistaProfesional {
  return {
    id: "postulacion-1",
    pedido: {
      id: "pedido-1",
      categoria: { nombre: "Plomería", slug: "plomeria" },
      descripcion: "Se rompió la canilla de la cocina",
      estado: "con_postulaciones",
    },
    mensaje: "Puedo pasar mañana a la mañana",
    estimacion: { aDefinir: false, minimo: 1000, maximo: 2000 },
    disponibilidad: null,
    estado: "enviada",
    otroYaElegido: false,
    enviadaEn: new Date().toISOString(),
    vistaEn: null,
    ...overrides,
  };
}

function paginaDeEjemplo(overrides: Partial<PostulacionesPagina> = {}): PostulacionesPagina {
  return { items: [], cursor: null, ...overrides };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/postulaciones"]}>
        <MisPostulacionesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MisPostulacionesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra el vacio de la pestaña enviadas con link al feed", async () => {
    vi.spyOn(api, "obtenerMisPostulaciones").mockResolvedValue(paginaDeEjemplo());
    renderPage();

    expect(await screen.findByText(/todavía no te postulaste/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver el feed de trabajos/i })).toBeInTheDocument();
  });

  it("lista las postulaciones enviadas y muestra la nota de D2 cuando otroYaElegido es true", async () => {
    vi.spyOn(api, "obtenerMisPostulaciones").mockResolvedValue(
      paginaDeEjemplo({ items: [postulacionDeEjemplo({ otroYaElegido: true })] }),
    );
    renderPage();

    expect(await screen.findByText(/plomería/i)).toBeInTheDocument();
    expect(
      screen.getByText(/el cliente eligió a otro; todavía podés ser elegido/i),
    ).toBeInTheDocument();
  });

  it("cambia de pestaña y pide el grupo correspondiente", async () => {
    const mock = vi.spyOn(api, "obtenerMisPostulaciones").mockResolvedValue(paginaDeEjemplo());
    const usuario = userEvent.setup();
    renderPage();

    await waitFor(() => expect(mock).toHaveBeenCalledWith("enviadas", undefined));

    await usuario.click(screen.getByRole("tab", { name: /seleccionadas/i }));

    await waitFor(() => expect(mock).toHaveBeenCalledWith("seleccionadas", undefined));
    expect(await screen.findByText(/ningún cliente te eligió todavía/i)).toBeInTheDocument();
  });

  it("no muestra el boton de retirar en la pestaña seleccionadas", async () => {
    vi.spyOn(api, "obtenerMisPostulaciones").mockResolvedValue(
      paginaDeEjemplo({ items: [postulacionDeEjemplo({ estado: "seleccionada" })] }),
    );
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(screen.getByRole("tab", { name: /seleccionadas/i }));

    await screen.findByText(/plomería/i);
    expect(screen.queryByRole("button", { name: /retirar postulación/i })).not.toBeInTheDocument();
  });

  it("retira una postulacion enviada tras confirmar", async () => {
    vi.spyOn(api, "obtenerMisPostulaciones").mockResolvedValue(
      paginaDeEjemplo({ items: [postulacionDeEjemplo()] }),
    );
    const mutacion = vi
      .spyOn(api, "retirarPostulacion")
      .mockResolvedValue(postulacionDeEjemplo({ estado: "retirada" }));
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("button", { name: /retirar postulación/i }));
    await usuario.click(screen.getByRole("button", { name: /sí, retirar/i }));

    await waitFor(() => expect(mutacion).toHaveBeenCalledWith("postulacion-1"));
  });

  it("muestra el error tipado si falla el retiro", async () => {
    vi.spyOn(api, "obtenerMisPostulaciones").mockResolvedValue(
      paginaDeEjemplo({ items: [postulacionDeEjemplo()] }),
    );
    vi.spyOn(api, "retirarPostulacion").mockRejectedValue(
      new ErrorApiHttp("no_encontrado", "La postulación no existe", 404),
    );
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("button", { name: /retirar postulación/i }));
    await usuario.click(screen.getByRole("button", { name: /sí, retirar/i }));

    expect(await screen.findByText(/la postulación no existe/i)).toBeInTheDocument();
  });
});
