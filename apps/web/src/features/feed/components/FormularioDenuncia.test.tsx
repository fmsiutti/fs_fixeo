import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TipoObjetoDenuncia } from "@fixeo/shared";
import { FormularioDenuncia } from "./FormularioDenuncia";
import * as feedApi from "../api";
import { ErrorApiHttp } from "../../../lib/http";

const PEDIDO_ID = "11111111-1111-4111-8111-111111111111";

function renderFormulario(
  onExito = vi.fn(),
  onCancelar = vi.fn(),
  tipoObjeto: TipoObjetoDenuncia = "pedido",
  objetoId = PEDIDO_ID,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    onExito,
    onCancelar,
    ...render(
      <QueryClientProvider client={queryClient}>
        <FormularioDenuncia
          tipoObjeto={tipoObjeto}
          objetoId={objetoId}
          onExito={onExito}
          onCancelar={onCancelar}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("FormularioDenuncia", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("no envia sin elegir un motivo", async () => {
    const mutacion = vi.spyOn(feedApi, "crearDenuncia").mockResolvedValue({ id: "denuncia-1" });
    const usuario = userEvent.setup();
    renderFormulario();

    await usuario.click(screen.getByRole("button", { name: /^denunciar$/i }));

    expect(await screen.findByText(/falta el motivo/i)).toBeInTheDocument();
    expect(mutacion).not.toHaveBeenCalled();
  });

  it("envia tipoObjeto, objetoId y motivo elegido, y avisa el exito", async () => {
    const mutacion = vi.spyOn(feedApi, "crearDenuncia").mockResolvedValue({ id: "denuncia-1" });
    const usuario = userEvent.setup();
    const { onExito } = renderFormulario();

    await usuario.selectOptions(screen.getByLabelText(/motivo/i), "Spam o publicidad");
    await usuario.click(screen.getByRole("button", { name: /^denunciar$/i }));

    await waitFor(() => expect(mutacion).toHaveBeenCalled());
    expect(mutacion.mock.calls[0]?.[0]).toEqual({
      tipoObjeto: "pedido",
      objetoId: PEDIDO_ID,
      motivo: "Spam o publicidad",
    });
    await waitFor(() => expect(onExito).toHaveBeenCalled());
  });

  it("muestra el error tipado de la api cuando falla el envio", async () => {
    vi.spyOn(feedApi, "crearDenuncia").mockRejectedValue(
      new ErrorApiHttp("validacion", "No pudimos registrar la denuncia", 400),
    );
    const usuario = userEvent.setup();
    renderFormulario();

    await usuario.selectOptions(screen.getByLabelText(/motivo/i), "Otro motivo");
    await usuario.click(screen.getByRole("button", { name: /^denunciar$/i }));

    expect(await screen.findByText(/no pudimos registrar la denuncia/i)).toBeInTheDocument();
  });

  it("llama a onCancelar al apretar cancelar", async () => {
    const usuario = userEvent.setup();
    const { onCancelar } = renderFormulario();

    await usuario.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onCancelar).toHaveBeenCalled();
  });

  it("tipoObjeto 'resenia': envia la clave del motivo (contrato con el backend), no la etiqueta en pantalla", async () => {
    const RESENIA_ID = "22222222-2222-4222-8222-222222222222";
    const mutacion = vi.spyOn(feedApi, "crearDenuncia").mockResolvedValue({ id: "denuncia-2" });
    const usuario = userEvent.setup();
    renderFormulario(vi.fn(), vi.fn(), "resenia", RESENIA_ID);

    // La etiqueta visible es "Agresión o lenguaje ofensivo", pero el backend
    // reacciona programaticamente a la clave ("agresion") para decidir si
    // oculta la reseña mientras se revisa (docs/dominio.md §8, D14).
    await usuario.selectOptions(screen.getByLabelText(/motivo/i), "Agresión o lenguaje ofensivo");
    await usuario.click(screen.getByRole("button", { name: /^denunciar$/i }));

    await waitFor(() => expect(mutacion).toHaveBeenCalled());
    expect(mutacion.mock.calls[0]?.[0]).toEqual({
      tipoObjeto: "resenia",
      objetoId: RESENIA_ID,
      motivo: "agresion",
    });
  });
});
