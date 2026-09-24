import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ContadorDiarioPostulaciones,
  PedidoVistaProfesional,
  PlantillaMensajeVista,
} from "@fixeo/shared";
import { PostularmePage } from "./PostularmePage";
import * as feedApi from "../../feed/api";
import * as postulacionesApi from "../api";
import { ErrorApiHttp } from "../../../lib/http";

const PEDIDO_ID = "11111111-1111-4111-8111-111111111111";

function pedidoDeEjemplo(overrides: Partial<PedidoVistaProfesional> = {}): PedidoVistaProfesional {
  return {
    id: PEDIDO_ID,
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategoria: null,
    descripcion: "Se rompió la canilla de la cocina",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: ["manana"],
    barrio: { id: "barrio-1", nombre: "Palermo" },
    distanciaKm: null,
    fotos: [],
    estado: "publicado",
    cliente: { nombre: "Ana" },
    cantidadPostulaciones: 0,
    postulacionesCupoLleno: false,
    yaEligioAlguien: false,
    seleccionablesLibres: 3,
    verificacionAprobada: true,
    publicadoEn: new Date().toISOString(),
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function contadorDeEjemplo(
  overrides: Partial<ContadorDiarioPostulaciones> = {},
): ContadorDiarioPostulaciones {
  return {
    usadas: 3,
    maximo: 10,
    renuevaEn: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function renderPage() {
  vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(pedidoDeEjemplo());
  vi.spyOn(postulacionesApi, "obtenerContadorDiarioPostulaciones").mockResolvedValue(
    contadorDeEjemplo(),
  );
  vi.spyOn(postulacionesApi, "obtenerPlantillasMensaje").mockResolvedValue([]);
  vi.spyOn(postulacionesApi, "registrarPostulacionIniciada").mockResolvedValue(undefined);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/trabajos/${PEDIDO_ID}/postularme`]}>
        <Routes>
          <Route path="/trabajos/:id/postularme" element={<PostularmePage />} />
          <Route path="/postulaciones" element={<p>Mis postulaciones</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PostularmePage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no envia con un mensaje mas corto que el minimo", async () => {
    const mutacion = vi.spyOn(postulacionesApi, "crearPostulacion");
    const usuario = userEvent.setup();
    renderPage();

    await screen.findByText(/plomería/i);
    await usuario.type(screen.getByLabelText(/mensaje para el cliente/i), "hola");
    await usuario.type(screen.getByLabelText(/mínimo/i), "1000");
    await usuario.type(screen.getByLabelText(/máximo/i), "2000");
    await usuario.click(screen.getByRole("button", { name: /enviar postulación/i }));

    expect(await screen.findByText(/contale un poco mas al cliente/i)).toBeInTheDocument();
    expect(mutacion).not.toHaveBeenCalled();
  });

  it("no envia cuando el minimo es mayor al maximo", async () => {
    const mutacion = vi.spyOn(postulacionesApi, "crearPostulacion");
    const usuario = userEvent.setup();
    renderPage();

    await screen.findByText(/plomería/i);
    await usuario.type(
      screen.getByLabelText(/mensaje para el cliente/i),
      "Puedo ir mañana a revisar la canilla",
    );
    await usuario.type(screen.getByLabelText(/mínimo/i), "5000");
    await usuario.type(screen.getByLabelText(/máximo/i), "1000");
    await usuario.click(screen.getByRole("button", { name: /enviar postulación/i }));

    expect(await screen.findByText(/no puede ser mayor al maximo/i)).toBeInTheDocument();
    expect(mutacion).not.toHaveBeenCalled();
  });

  it("envia la postulacion con un rango valido y navega a mis postulaciones", async () => {
    const mutacion = vi.spyOn(postulacionesApi, "crearPostulacion").mockResolvedValue({} as never);
    const usuario = userEvent.setup();
    renderPage();

    await screen.findByText(/plomería/i);
    await usuario.type(
      screen.getByLabelText(/mensaje para el cliente/i),
      "Puedo ir mañana a revisar la canilla",
    );
    await usuario.type(screen.getByLabelText(/mínimo/i), "1000");
    await usuario.type(screen.getByLabelText(/máximo/i), "2000");
    await usuario.click(screen.getByRole("button", { name: /enviar postulación/i }));

    await waitFor(() => expect(mutacion).toHaveBeenCalled());
    expect(mutacion.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        pedidoId: PEDIDO_ID,
        estimacion: { aDefinir: false, minimo: 1000, maximo: 2000 },
      }),
    );
    await screen.findByText(/mis postulaciones/i);
  });

  it("envia con estimacion a definir en la visita, sin pedir minimo/maximo", async () => {
    const mutacion = vi.spyOn(postulacionesApi, "crearPostulacion").mockResolvedValue({} as never);
    const usuario = userEvent.setup();
    renderPage();

    await screen.findByText(/plomería/i);
    await usuario.type(
      screen.getByLabelText(/mensaje para el cliente/i),
      "Puedo ir mañana a revisar la canilla",
    );
    await usuario.click(screen.getByText(/a definir en la visita/i));
    await usuario.click(screen.getByRole("button", { name: /enviar postulación/i }));

    await waitFor(() => expect(mutacion).toHaveBeenCalled());
    expect(mutacion.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ estimacion: { aDefinir: true } }),
    );
  });

  it("no pierde el mensaje escrito cuando el envio falla, y muestra el error", async () => {
    vi.spyOn(postulacionesApi, "crearPostulacion").mockRejectedValue(
      new ErrorApiHttp("conflicto", "Ya te postulaste a este pedido", 409),
    );
    const usuario = userEvent.setup();
    renderPage();

    await screen.findByText(/plomería/i);
    const mensaje = "Puedo ir mañana a revisar la canilla";
    await usuario.type(screen.getByLabelText(/mensaje para el cliente/i), mensaje);
    await usuario.type(screen.getByLabelText(/mínimo/i), "1000");
    await usuario.type(screen.getByLabelText(/máximo/i), "2000");
    await usuario.click(screen.getByRole("button", { name: /enviar postulación/i }));

    expect(await screen.findByText(/ya te postulaste a este pedido/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mensaje para el cliente/i)).toHaveValue(mensaje);
  });

  it("sugiere ir al perfil cuando la api responde no_autorizado", async () => {
    vi.spyOn(postulacionesApi, "crearPostulacion").mockRejectedValue(
      new ErrorApiHttp("no_autorizado", "Necesitás tener tu identidad verificada", 403),
    );
    const usuario = userEvent.setup();
    renderPage();

    await screen.findByText(/plomería/i);
    await usuario.type(
      screen.getByLabelText(/mensaje para el cliente/i),
      "Puedo ir mañana a revisar la canilla",
    );
    await usuario.type(screen.getByLabelText(/mínimo/i), "1000");
    await usuario.type(screen.getByLabelText(/máximo/i), "2000");
    await usuario.click(screen.getByRole("button", { name: /enviar postulación/i }));

    expect(await screen.findByText(/necesitás tener tu identidad verificada/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ir a mi perfil/i })).toBeInTheDocument();
  });

  it("rellena el mensaje al elegir una plantilla cuando el campo esta vacio", async () => {
    const plantilla: PlantillaMensajeVista = {
      id: "plantilla-1",
      texto: "Hola, puedo pasar hoy a la tarde",
      creadoEn: new Date().toISOString(),
    };
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(pedidoDeEjemplo());
    vi.spyOn(postulacionesApi, "obtenerContadorDiarioPostulaciones").mockResolvedValue(
      contadorDeEjemplo(),
    );
    vi.spyOn(postulacionesApi, "obtenerPlantillasMensaje").mockResolvedValue([plantilla]);
    vi.spyOn(postulacionesApi, "registrarPostulacionIniciada").mockResolvedValue(undefined);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const usuario = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/trabajos/${PEDIDO_ID}/postularme`]}>
          <Routes>
            <Route path="/trabajos/:id/postularme" element={<PostularmePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await usuario.click(await screen.findByText(plantilla.texto));

    expect(screen.getByLabelText(/mensaje para el cliente/i)).toHaveValue(plantilla.texto);
  });

  it("muestra el contador diario alcanzado y deshabilita el envio", async () => {
    vi.spyOn(feedApi, "obtenerDetalleFeedTrabajo").mockResolvedValue(pedidoDeEjemplo());
    vi.spyOn(postulacionesApi, "obtenerContadorDiarioPostulaciones").mockResolvedValue(
      contadorDeEjemplo({ usadas: 10, maximo: 10 }),
    );
    vi.spyOn(postulacionesApi, "obtenerPlantillasMensaje").mockResolvedValue([]);
    vi.spyOn(postulacionesApi, "registrarPostulacionIniciada").mockResolvedValue(undefined);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/trabajos/${PEDIDO_ID}/postularme`]}>
          <Routes>
            <Route path="/trabajos/:id/postularme" element={<PostularmePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /enviar postulación/i })).toBeDisabled(),
    );
    expect(screen.getByText(/usaste 10 de 10 postulaciones hoy/i)).toBeInTheDocument();
  });
});
