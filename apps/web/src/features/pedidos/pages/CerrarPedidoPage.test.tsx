import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CerrarPedido, ContactoVistaCliente, PedidoVista, UsuarioVista } from "@fixeo/shared";
import { CerrarPedidoPage } from "./CerrarPedidoPage";
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

function pedidoDeEjemplo(overrides: Partial<PedidoVista> = {}): PedidoVista {
  return {
    id: "pedido-1",
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategoria: null,
    descripcion: "Se rompió la canilla de la cocina",
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
    estado: "contacto_habilitado",
    publicadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    expiraEn: new Date("2026-01-08T00:00:00.000Z").toISOString(),
    cierreAutomaticoEn: new Date("2026-01-15T00:00:00.000Z").toISOString(),
    desenlace: null,
    desenlacePostergado: false,
    fotos: [],
    vistas: 0,
    cantidadPostulaciones: 1,
    postulacionesCupoLleno: false,
    cantidadContactos: 1,
    seleccionablesLibres: 2,
    creadoEn: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function contactoDeEjemplo(overrides: Partial<ContactoVistaCliente> = {}): ContactoVistaCliente {
  return {
    id: "contacto-1",
    postulacionId: "postulacion-1",
    orden: 1,
    profesional: {
      id: "profesional-1",
      nombre: "Juan",
      apellido: "Pérez",
      fotoUrl: null,
      telefono: "+5491133334444",
      promedioResenias: 4.8,
      cantidadResenias: 12,
      aniosExperiencia: 5,
    },
    mensaje: "Puedo pasar mañana a la mañana a revisar la canilla",
    estimacion: { aDefinir: false, minimo: 1000, maximo: 2000 },
    estadoPostulacion: "seleccionada",
    habilitadoEn: new Date("2026-01-03T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function renderPage(
  pedido: PedidoVista,
  contactos: ContactoVistaCliente[] = [contactoDeEjemplo()],
) {
  vi.spyOn(api, "obtenerPedido").mockResolvedValue(pedido);
  vi.spyOn(api, "obtenerContactoDelPedido").mockResolvedValue(contactos);

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
        <MemoryRouter initialEntries={[`/pedidos/${pedido.id}/cerrar`]}>
          <Routes>
            <Route path="/pedidos/:id/cerrar" element={<CerrarPedidoPage />} />
          </Routes>
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("CerrarPedidoPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra las 4 opciones de desenlace", async () => {
    renderPage(pedidoDeEjemplo());

    expect(await screen.findByText(/lo hizo este profesional/i)).toBeInTheDocument();
    expect(screen.getByText(/^lo hizo otro$/i)).toBeInTheDocument();
    expect(screen.getByText(/ya no lo necesito/i)).toBeInTheDocument();
    expect(screen.getByText(/todavía no lo resolví/i)).toBeInTheDocument();
  });

  it('al elegir "lo hizo este profesional" muestra el selector de contacto y el formulario de reseña', async () => {
    const usuario = userEvent.setup();
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo()]);

    await usuario.click(await screen.findByText(/lo hizo este profesional/i));

    expect(await screen.findByText(/cuál de los elegidos hizo el trabajo/i)).toBeInTheDocument();
    expect(screen.getByText(/juan pérez/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /puntaje de 1 a 5 estrellas/i })).toBeInTheDocument();
    expect(screen.getByText(/^puntual$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/comentario \(opcional\)/i)).toBeInTheDocument();
  });

  it('"todavía no lo resolví" aparece deshabilitada cuando el pedido ya postergó una vez, con el motivo explicado', async () => {
    renderPage(pedidoDeEjemplo({ desenlacePostergado: true }));

    const opcion = await screen.findByRole("radio", { name: /todavía no lo resolví/i });
    expect(opcion).toBeDisabled();
    expect(
      screen.getByText(/ya postergaste el desenlace de este pedido una vez/i),
    ).toBeInTheDocument();
  });

  it('"todavía no lo resolví" esta habilitada cuando todavia no se postergo', async () => {
    renderPage(pedidoDeEjemplo({ desenlacePostergado: false }));

    const opcion = await screen.findByRole("radio", { name: /todavía no lo resolví/i });
    expect(opcion).not.toBeDisabled();
  });

  it('"lo hizo otro" cierra el pedido sin pedir contacto ni reseña', async () => {
    const mockCerrar = vi
      .spyOn(api, "cerrarPedido")
      .mockResolvedValue(pedidoDeEjemplo({ estado: "cerrado", desenlace: "lo_hizo_otro" }));
    const usuario = userEvent.setup();
    renderPage(pedidoDeEjemplo());

    await usuario.click(await screen.findByText(/^lo hizo otro$/i));
    await usuario.click(screen.getByRole("button", { name: /cerrar pedido/i }));

    await waitFor(() =>
      expect(mockCerrar).toHaveBeenCalledWith("pedido-1", {
        desenlace: "lo_hizo_otro",
      } as CerrarPedido),
    );
  });

  it('"lo hizo este profesional": enviar sin reseña (omitir) manda el cierre sin el campo resenia', async () => {
    const mockCerrar = vi
      .spyOn(api, "cerrarPedido")
      .mockResolvedValue(
        pedidoDeEjemplo({ estado: "cerrado", desenlace: "lo_hizo_este_profesional" }),
      );
    const usuario = userEvent.setup();
    // UUID valido de verdad (version/variante correctas): cerrarPedidoSchema
    // exige z.string().uuid(), que un id "prolijo" tipo "contacto-9" no pasa.
    const contactoId = crypto.randomUUID();
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo({ id: contactoId })]);

    await usuario.click(await screen.findByRole("radio", { name: /lo hizo este profesional/i }));
    await usuario.click(await screen.findByRole("radio", { name: /juan pérez/i }));
    await usuario.click(screen.getByRole("button", { name: /cerrar sin reseñar/i }));

    await waitFor(() =>
      expect(mockCerrar).toHaveBeenCalledWith("pedido-1", {
        desenlace: "lo_hizo_este_profesional",
        contactoId,
      } as CerrarPedido),
    );
  });

  it('"lo hizo este profesional": publicar reseña sin elegir puntaje muestra un mensaje en español junto al selector, no el mensaje crudo de Zod, y no envía el cierre', async () => {
    const mockCerrar = vi
      .spyOn(api, "cerrarPedido")
      .mockResolvedValue(
        pedidoDeEjemplo({ estado: "cerrado", desenlace: "lo_hizo_este_profesional" }),
      );
    const usuario = userEvent.setup();
    const contactoId = crypto.randomUUID();
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo({ id: contactoId })]);

    await usuario.click(await screen.findByRole("radio", { name: /lo hizo este profesional/i }));
    await usuario.click(await screen.findByRole("radio", { name: /juan pérez/i }));
    await usuario.click(screen.getByRole("button", { name: /publicar reseña y cerrar/i }));

    expect(await screen.findByText(/elegí un puntaje de 1 a 5 estrellas/i)).toBeInTheDocument();
    expect(screen.queryByText(/too small/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expected number/i)).not.toBeInTheDocument();
    expect(mockCerrar).not.toHaveBeenCalled();
  });

  it('"todavía no lo resolví": confirmar postergs sin cerrar el pedido y muestra el aviso de que se posterga', async () => {
    const mockCerrar = vi
      .spyOn(api, "cerrarPedido")
      .mockResolvedValue(
        pedidoDeEjemplo({ desenlacePostergado: true, estado: "contacto_habilitado" }),
      );
    const usuario = userEvent.setup();
    renderPage(pedidoDeEjemplo());

    await usuario.click(await screen.findByText(/todavía no lo resolví/i));
    await usuario.click(screen.getByRole("button", { name: /^confirmar$/i }));

    await waitFor(() =>
      expect(mockCerrar).toHaveBeenCalledWith("pedido-1", {
        desenlace: "todavia_no_lo_resolvi",
      } as CerrarPedido),
    );
    expect(
      await screen.findByText(/listo, te volvemos a preguntar en una semana/i),
    ).toBeInTheDocument();
  });
});
