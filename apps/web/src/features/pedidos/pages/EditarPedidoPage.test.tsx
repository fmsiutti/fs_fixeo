import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CategoriaVista, PedidoVista, UsuarioVista } from "@fixeo/shared";
import { EditarPedidoPage } from "./EditarPedidoPage";
import { SesionContext, type SesionContextValor } from "../../auth/SesionContext";
import * as api from "../api";

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

function categoriaDeEjemplo(overrides: Partial<CategoriaVista> = {}): CategoriaVista {
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

function pedidoDeEjemplo(overrides: Partial<PedidoVista> = {}): PedidoVista {
  return {
    id: "pedido-1",
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategoria: null,
    descripcion: "Se rompió la canilla de la cocina y pierde agua todo el día",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    direccion: {
      calle: "Av. Siempreviva",
      numero: "742",
      piso: null,
      depto: null,
      tipoPropiedad: "casa",
      lat: -34.6,
      lng: -58.4,
    },
    barrio: { id: "barrio-1", nombre: "Palermo" },
    estado: "publicado",
    publicadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    expiraEn: new Date("2026-01-08T00:00:00.000Z").toISOString(),
    fotos: [],
    vistas: 0,
    cantidadPostulaciones: 0,
    postulacionesCupoLleno: false,
    cantidadContactos: 0,
    seleccionablesLibres: 3,
    creadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function renderPage(pedido: PedidoVista, categorias: CategoriaVista[] = [categoriaDeEjemplo()]) {
  vi.spyOn(api, "obtenerPedido").mockResolvedValue(pedido);
  vi.spyOn(api, "obtenerCategorias").mockResolvedValue(categorias);
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
        <MemoryRouter initialEntries={[`/pedidos/${pedido.id}/editar`]}>
          <Routes>
            <Route path="/pedidos/:id/editar" element={<EditarPedidoPage />} />
            <Route path="/pedidos/:id" element={<div>Detalle del pedido</div>} />
          </Routes>
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("EditarPedidoPage", () => {
  it("precarga la descripcion, urgencia y franjas actuales del pedido", async () => {
    renderPage(pedidoDeEjemplo());

    expect(
      await screen.findByDisplayValue(
        "Se rompió la canilla de la cocina y pierde agua todo el día",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /sin apuro/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /mañana/i })).toBeChecked();
  });

  it("muestra las preguntas guia de la categoria del pedido", async () => {
    renderPage(pedidoDeEjemplo(), [
      categoriaDeEjemplo({ preguntasGuia: ["¿Que tipo de artefacto?"] }),
    ]);

    expect(await screen.findByLabelText("¿Que tipo de artefacto?")).toBeInTheDocument();
  });

  it("guarda los cambios y vuelve al detalle del pedido", async () => {
    const editarPedido = vi
      .spyOn(api, "editarPedido")
      .mockResolvedValue(
        pedidoDeEjemplo({ descripcion: "Descripcion nueva y suficientemente larga" }),
      );
    const usuario = userEvent.setup();
    renderPage(pedidoDeEjemplo());

    const textarea = await screen.findByLabelText(/describí qué pasa/i);
    await usuario.clear(textarea);
    await usuario.type(textarea, "Descripcion nueva y suficientemente larga");
    await usuario.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => expect(editarPedido).toHaveBeenCalled());
    expect(editarPedido.mock.calls[0]?.[1]).toMatchObject({
      descripcion: "Descripcion nueva y suficientemente larga",
      urgencia: "sin_apuro",
      franjas: ["manana"],
    });
    await waitFor(() => expect(screen.getByText("Detalle del pedido")).toBeInTheDocument());
  });

  it("redirige al detalle si el pedido ya tiene postulaciones (docs/dominio.md §3)", async () => {
    renderPage(pedidoDeEjemplo({ cantidadPostulaciones: 1 }));

    await waitFor(() => expect(screen.getByText("Detalle del pedido")).toBeInTheDocument());
  });
});
