import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormularioDenuncia } from "./FormularioDenuncia";
import * as feedApi from "../api";
import { ErrorApiHttp } from "../../../lib/http";

const PEDIDO_ID = "11111111-1111-4111-8111-111111111111";

function renderFormulario(onExito = vi.fn(), onCancelar = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    onExito,
    onCancelar,
    ...render(
      <QueryClientProvider client={queryClient}>
        <FormularioDenuncia
          tipoObjeto="pedido"
          objetoId={PEDIDO_ID}
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
});
