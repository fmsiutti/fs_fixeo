import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InicioPage } from "./InicioPage";
import * as api from "../api";

function renderConQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <InicioPage />
    </QueryClientProvider>,
  );
}

describe("InicioPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("muestra el estado de la api cuando responde ok", async () => {
    vi.spyOn(api, "obtenerSalud").mockResolvedValue({ estado: "ok" });

    renderConQueryClient();

    expect(await screen.findByText(/api conectada/i)).toBeInTheDocument();
  });

  it("muestra un error cuando la api no responde", async () => {
    vi.spyOn(api, "obtenerSalud").mockRejectedValue(new Error("network error"));

    renderConQueryClient();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
