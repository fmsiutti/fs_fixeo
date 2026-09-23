import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CategoriaVista } from "@fixeo/shared";
import { QueNecesitasPage } from "./QueNecesitasPage";
import * as api from "../api";

const CLAVE_STORAGE = "fixeo:borrador-pedido";

function categoria(overrides: Partial<CategoriaVista> = {}): CategoriaVista {
  return {
    id: "categoria-1",
    nombre: "Plomería",
    slug: "plomeria",
    subcategorias: [],
    preguntasGuia: [],
    requiereMatricula: "no_exigida",
    ...overrides,
  } as CategoriaVista;
}

function renderPage() {
  vi.spyOn(api, "obtenerCategorias").mockResolvedValue([
    categoria(),
    categoria({ id: "categoria-2", nombre: "Electricidad", slug: "electricidad" }),
  ]);
  vi.spyOn(api, "registrarEvento").mockResolvedValue(undefined);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/publicar/que"]}>
        <Routes>
          <Route path="/publicar/que" element={<QueNecesitasPage />} />
          <Route path="/publicar/problema" element={<div>Paso 2</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function leerBorradorGuardado(): {
  categoriaId: string | null;
  respuestasGuia: Record<string, string>;
} {
  return JSON.parse(window.localStorage.getItem(CLAVE_STORAGE) ?? "{}");
}

describe("QueNecesitasPage", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  // Bug real encontrado en revisión: cambiar de categoría con respuestas guía
  // ya cargadas las dejaba huérfanas (la pantalla del paso 2 solo renderiza
  // las preguntas de la categoría actual, así que no había forma de borrarlas
  // desde la UI) y el service las rechazaba al publicar con un 400 genérico.
  it("resetea las respuestas guia al elegir una categoria distinta a la del borrador", async () => {
    window.localStorage.setItem(
      CLAVE_STORAGE,
      JSON.stringify({
        borradorId: "11111111-1111-1111-1111-111111111111",
        categoriaId: "categoria-1",
        respuestasGuia: { "¿Que tipo de artefacto?": "termotanque" },
        descripcion: "",
        fotos: [],
        direccion: null,
        urgencia: null,
        franjas: [],
      }),
    );
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("button", { name: /electricidad/i }));

    await waitFor(() => expect(screen.getByText("Paso 2")).toBeInTheDocument());
    const guardado = leerBorradorGuardado();
    expect(guardado.categoriaId).toBe("categoria-2");
    expect(guardado.respuestasGuia).toEqual({});
  });

  it("no toca las respuestas guia si se vuelve a elegir la misma categoria", async () => {
    window.localStorage.setItem(
      CLAVE_STORAGE,
      JSON.stringify({
        borradorId: "11111111-1111-1111-1111-111111111111",
        categoriaId: "categoria-1",
        respuestasGuia: { "¿Que tipo de artefacto?": "termotanque" },
        descripcion: "",
        fotos: [],
        direccion: null,
        urgencia: null,
        franjas: [],
      }),
    );
    const usuario = userEvent.setup();
    renderPage();

    await usuario.click(await screen.findByRole("button", { name: /plomería/i }));

    await waitFor(() => expect(screen.getByText("Paso 2")).toBeInTheDocument());
    const guardado = leerBorradorGuardado();
    expect(guardado.respuestasGuia).toEqual({ "¿Que tipo de artefacto?": "termotanque" });
  });
});
