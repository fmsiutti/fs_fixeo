import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactoVistaCliente, PedidoVista, UsuarioVista } from "@fixeo/shared";
import { ContactoPedidoPage } from "./ContactoPedidoPage";
import { SesionContext, type SesionContextValor } from "../../auth/SesionContext";
import * as api from "../api";
import * as postulacionesApi from "../../postulaciones/api";
import { ErrorApiHttp } from "../../../lib/http";

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

function renderPage(pedido: PedidoVista, contactos: ContactoVistaCliente[] | Error) {
  vi.spyOn(api, "obtenerPedido").mockResolvedValue(pedido);
  if (contactos instanceof Error) {
    vi.spyOn(api, "obtenerContactoDelPedido").mockRejectedValue(contactos);
  } else {
    vi.spyOn(api, "obtenerContactoDelPedido").mockResolvedValue(contactos);
  }

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
        <MemoryRouter initialEntries={[`/pedidos/${pedido.id}/contacto`]}>
          <Routes>
            <Route path="/pedidos/:id/contacto" element={<ContactoPedidoPage />} />
          </Routes>
        </MemoryRouter>
      </SesionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("ContactoPedidoPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra el spinner mientras carga", () => {
    vi.spyOn(api, "obtenerPedido").mockReturnValue(new Promise(() => {}));
    vi.spyOn(api, "obtenerContactoDelPedido").mockReturnValue(new Promise(() => {}));

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
    render(
      <QueryClientProvider client={queryClient}>
        <SesionContext.Provider value={valorSesion}>
          <MemoryRouter initialEntries={["/pedidos/pedido-1/contacto"]}>
            <Routes>
              <Route path="/pedidos/:id/contacto" element={<ContactoPedidoPage />} />
            </Routes>
          </MemoryRouter>
        </SesionContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/cargando el contacto/i)).toBeInTheDocument();
  });

  it("muestra el error y permite reintentar cuando falla la carga", async () => {
    const errorContactos = new ErrorApiHttp(
      "no_encontrado",
      "Este pedido no existe o no es tuyo",
      404,
    );
    const mockContactos = vi
      .spyOn(api, "obtenerContactoDelPedido")
      .mockRejectedValue(errorContactos);
    vi.spyOn(api, "obtenerPedido").mockResolvedValue(pedidoDeEjemplo());
    const usuario = userEvent.setup();

    renderPage(pedidoDeEjemplo(), errorContactos);

    expect(await screen.findByText(/no pudimos cargar el contacto/i)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: /reintentar/i }));

    await waitFor(() => expect(mockContactos).toHaveBeenCalledTimes(2));
  });

  it("muestra el vacio cuando el pedido todavia no tiene contactos", async () => {
    renderPage(pedidoDeEjemplo({ cantidadContactos: 0 }), []);

    expect(
      await screen.findByText(/todavía no elegiste a ningún profesional para este pedido/i),
    ).toBeInTheDocument();
  });

  it("muestra un bloque con telefono, nombre y mensaje/estimacion de cada contacto", async () => {
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo()]);

    expect(await screen.findByText(/juan pérez/i)).toBeInTheDocument();
    expect(screen.getByText(/\+5491133334444/)).toBeInTheDocument();
    expect(screen.getByText(/puedo pasar mañana a la mañana/i)).toBeInTheDocument();
    expect(screen.getByText(/\$ ?1\.000/)).toBeInTheDocument();
  });

  it("cuando la postulacion esta retirada, muestra la nota y no renderiza llamar ni whatsapp, pero si copiar y el telefono", async () => {
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo({ estadoPostulacion: "retirada" })]);

    expect(
      await screen.findByText(/este profesional no puede tomar tu pedido/i),
    ).toBeInTheDocument();
    // Reveal simultaneo: el telefono ya revelado no se oculta.
    expect(screen.getByText(/\+5491133334444/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^llamar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^whatsapp$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^copiar$/i })).toBeInTheDocument();
  });

  it("no muestra la nota de retirada ni oculta los botones cuando la postulacion sigue activa", async () => {
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo({ estadoPostulacion: "seleccionada" })]);

    await screen.findByText(/juan pérez/i);
    expect(
      screen.queryByText(/este profesional no puede tomar tu pedido/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^llamar$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^whatsapp$/i })).toBeInTheDocument();
  });

  it("al hacer click en Llamar registra el evento llamada_iniciada con el postulacionId del contacto", async () => {
    const mockEvento = vi
      .spyOn(postulacionesApi, "registrarEventoContacto")
      .mockResolvedValue(undefined);
    const usuario = userEvent.setup();
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo({ postulacionId: "postulacion-xyz" })]);

    await usuario.click(await screen.findByRole("link", { name: /^llamar$/i }));

    await waitFor(() =>
      expect(mockEvento).toHaveBeenCalledWith("postulacion-xyz", "llamada_iniciada"),
    );
  });

  it("al hacer click en WhatsApp registra el evento whatsapp_abierto con el postulacionId del contacto", async () => {
    const mockEvento = vi
      .spyOn(postulacionesApi, "registrarEventoContacto")
      .mockResolvedValue(undefined);
    const usuario = userEvent.setup();
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo({ postulacionId: "postulacion-xyz" })]);

    await usuario.click(await screen.findByRole("link", { name: /^whatsapp$/i }));

    await waitFor(() =>
      expect(mockEvento).toHaveBeenCalledWith("postulacion-xyz", "whatsapp_abierto"),
    );
  });

  it("avisa que todavia quedan lugares cuando seleccionablesLibres es mayor a 0", async () => {
    renderPage(pedidoDeEjemplo({ seleccionablesLibres: 2 }), [contactoDeEjemplo()]);

    expect(await screen.findByText(/todavía te quedan 2 lugares/i)).toBeInTheDocument();
  });

  it("avisa que ya elegiste a los profesionales cuando seleccionablesLibres es 0", async () => {
    renderPage(pedidoDeEjemplo({ seleccionablesLibres: 0 }), [contactoDeEjemplo()]);

    expect(
      await screen.findByText(/ya elegiste a los profesionales para este pedido/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/todavía te queda/i)).not.toBeInTheDocument();
  });

  it("copia el telefono al portapapeles y muestra la confirmacion", async () => {
    // @testing-library/user-event instala su propio stub de navigator.clipboard
    // al llamar a userEvent.setup(); hay que espiarlo despues de esa llamada,
    // sino la sobreescribe.
    const usuario = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    renderPage(pedidoDeEjemplo(), [contactoDeEjemplo()]);

    await usuario.click(await screen.findByRole("button", { name: /^copiar$/i }));

    expect(writeText).toHaveBeenCalledWith("+5491133334444");
    expect(await screen.findByText(/copiamos el número/i)).toBeInTheDocument();
  });
});
