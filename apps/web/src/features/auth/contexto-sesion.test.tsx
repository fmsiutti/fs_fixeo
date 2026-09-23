import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SesionProvider } from "./contexto-sesion";
import { useSesion } from "./useSesion";
import * as api from "./api";

function ConsumidorDePrueba() {
  const { usuario, cargando } = useSesion();
  return <div>{cargando ? "cargando" : usuario ? `usuario:${usuario.id}` : "sin-usuario"}</div>;
}

describe("SesionProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("si el refresh silencioso al montar falla, cargando pasa a false y el usuario queda null sin explotar", async () => {
    vi.spyOn(api, "refrescarSesion").mockRejectedValue(new Error("no habia sesion previa"));

    render(
      <SesionProvider>
        <ConsumidorDePrueba />
      </SesionProvider>,
    );

    expect(screen.getByText("cargando")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("sin-usuario")).toBeInTheDocument());
  });

  it("si el refresh silencioso funciona, carga el usuario devuelto por la api", async () => {
    vi.spyOn(api, "refrescarSesion").mockResolvedValue({
      accessToken: "token",
      usuario: {
        id: "usuario-42",
        telefono: "+5491100000050",
        nombre: null,
        apellido: null,
        email: null,
        fotoUrl: null,
        rolActivo: "cliente",
        estado: "activo",
        creadoEn: new Date().toISOString(),
      },
    });

    render(
      <SesionProvider>
        <ConsumidorDePrueba />
      </SesionProvider>,
    );

    await waitFor(() => expect(screen.getByText("usuario:usuario-42")).toBeInTheDocument());
  });
});
