import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CategoriaVista, OficioVista, PerfilProfesionalVistaPropia } from "@fixeo/shared";
import { ArmarPerfilWizard } from "./ArmarPerfilWizard";
import * as perfilApi from "../api";
import * as pedidosApi from "../../pedidos/api";

function perfilBase(
  overrides: Partial<PerfilProfesionalVistaPropia> = {},
): PerfilProfesionalVistaPropia {
  return {
    id: "perfil-1",
    presentacion: null,
    aniosExperiencia: null,
    estadoVerificacion: "pendiente",
    verificadoEn: null,
    pausado: false,
    tasaRespuesta: null,
    promedioResenias: null,
    cantidadResenias: 0,
    trabajosCerrados: 0,
    oficios: [],
    zonaCobertura: null,
    verificaciones: [],
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function oficioVista(overrides: Partial<OficioVista> = {}): OficioVista {
  return {
    id: "oficio-1",
    categoria: { id: "categoria-1", nombre: "Plomería", slug: "plomeria" },
    subcategorias: [],
    matriculaNumero: null,
    matriculaEnte: null,
    matriculaEstado: "no_requerida",
    matriculaVenceEn: null,
    ...overrides,
  };
}

function categoriaVista(overrides: Partial<CategoriaVista> = {}): CategoriaVista {
  return {
    id: "categoria-1",
    nombre: "Plomería",
    slug: "plomeria",
    subcategorias: [],
    preguntasGuia: [],
    requiereMatricula: "no_exigida",
    ...overrides,
  };
}

function renderWizard(
  perfilInicial: PerfilProfesionalVistaPropia | undefined,
  categorias: CategoriaVista[] = [],
) {
  vi.spyOn(pedidosApi, "obtenerCategorias").mockResolvedValue(categorias);
  vi.spyOn(pedidosApi, "obtenerBarrios").mockResolvedValue([]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ArmarPerfilWizard perfilInicial={perfilInicial} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// PR-01: "dejá saltar a un paso posterior si el anterior ya está completo (no
// obligues a re-rellenar)" — la barra de progreso solo habilita el resto de
// los pasos una vez que el perfil existe y tiene al menos un oficio cargado.
describe("ArmarPerfilWizard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin perfil arranca en Datos con el resto de los pasos bloqueados", () => {
    renderWizard(undefined);

    expect(screen.getByRole("tab", { name: "Datos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Oficios" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Zona" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Identidad" })).toBeDisabled();
  });

  it("al guardar Datos avanza a Oficios, pero Zona sigue bloqueada sin oficios cargados", async () => {
    vi.spyOn(perfilApi, "armarPerfil").mockResolvedValue(perfilBase());
    const usuario = userEvent.setup();
    renderWizard(undefined);

    await usuario.click(screen.getByRole("button", { name: /continuar/i }));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Oficios" })).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.getByRole("tab", { name: "Zona" })).toBeDisabled();
  });

  it("con oficios ya cargados, zona e identidad quedan alcanzables aunque no esten completos", () => {
    renderWizard(perfilBase({ oficios: [oficioVista()] }));

    expect(screen.getByRole("tab", { name: "Zona" })).not.toBeDisabled();
    expect(screen.getByRole("tab", { name: "Identidad" })).not.toBeDisabled();
  });

  // docs/dominio.md D9: el gating del paso Matricula se basa en
  // `categoria.requiereMatricula`, no en `oficio.matriculaEstado` (ese campo
  // recien pasa a "pendiente" para las recomendadas cuando el profesional
  // sube algo por su cuenta).
  it("sin ningun oficio con matricula obligatoria ni recomendada, el wizard no ofrece el paso Matrícula", () => {
    renderWizard(perfilBase({ oficios: [oficioVista({ matriculaEstado: "no_requerida" })] }), [
      categoriaVista({ requiereMatricula: "no_exigida" }),
    ]);

    expect(screen.queryByRole("tab", { name: "Matrícula" })).not.toBeInTheDocument();
  });

  it("con un oficio de matricula obligatoria, el wizard agrega el paso Matrícula y queda alcanzable", async () => {
    renderWizard(
      perfilBase({
        oficios: [
          oficioVista({
            categoria: { id: "categoria-gas", nombre: "Gas", slug: "gas" },
            matriculaEstado: "pendiente",
          }),
        ],
      }),
      [
        categoriaVista({
          id: "categoria-gas",
          nombre: "Gas",
          slug: "gas",
          requiereMatricula: "obligatoria",
        }),
      ],
    );

    expect(await screen.findByRole("tab", { name: "Matrícula" })).not.toBeDisabled();
  });

  it("con un oficio de matricula recomendada, el paso Matrícula aparece pero es salteable", async () => {
    const usuario = userEvent.setup();
    renderWizard(
      perfilBase({
        oficios: [
          oficioVista({
            categoria: { id: "categoria-aire", nombre: "Aire acondicionado", slug: "aire" },
            matriculaEstado: "no_requerida",
          }),
        ],
      }),
      [
        categoriaVista({
          id: "categoria-aire",
          nombre: "Aire acondicionado",
          slug: "aire",
          requiereMatricula: "recomendada",
        }),
      ],
    );

    const tabMatricula = await screen.findByRole("tab", { name: "Matrícula" });
    expect(tabMatricula).not.toBeDisabled();

    await usuario.click(tabMatricula);

    expect(screen.getByText(/podés continuar sin cargar la matrícula ahora/i)).toBeInTheDocument();
    expect(screen.getByText(/opcional para esta categoría/i)).toBeInTheDocument();
  });
});
