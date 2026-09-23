import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { UsuarioVista } from "@fixeo/shared";
import { RutaConRol } from "./RutaConRol";
import { SesionContext, type SesionContextValor } from "../features/auth/SesionContext";

function usuario(overrides: Partial<UsuarioVista> = {}): UsuarioVista {
  return {
    id: "usuario-1",
    telefono: "+5491100000030",
    nombre: null,
    apellido: null,
    email: null,
    fotoUrl: null,
    rolActivo: null,
    estado: "activo",
    creadoEn: new Date().toISOString(),
    ...overrides,
  };
}

function renderRuta(usuarioActual: UsuarioVista | null) {
  const valorSesion: SesionContextValor = {
    usuario: usuarioActual,
    estaAutenticado: usuarioActual !== null,
    cargando: false,
    confirmarSesion: vi.fn(),
    cerrarSesion: vi.fn(),
    actualizarUsuario: vi.fn(),
  };

  return render(
    <SesionContext.Provider value={valorSesion}>
      <MemoryRouter initialEntries={["/protegida"]}>
        <Routes>
          <Route
            path="/protegida"
            element={
              <RutaConRol roles={["profesional"]}>
                <p>Contenido protegido</p>
              </RutaConRol>
            }
          />
          <Route path="/ingresar" element={<p>Pantalla de ingreso</p>} />
          <Route path="/" element={<p>Inicio</p>} />
        </Routes>
      </MemoryRouter>
    </SesionContext.Provider>,
  );
}

describe("RutaConRol", () => {
  it("manda a /ingresar si no hay sesion", () => {
    renderRuta(null);

    expect(screen.getByText("Pantalla de ingreso")).toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
  });

  it("manda a / si el rol_activo no esta permitido", () => {
    renderRuta(usuario({ rolActivo: "cliente" }));

    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
  });

  it("muestra el contenido si el rol_activo esta permitido", () => {
    renderRuta(usuario({ rolActivo: "profesional" }));

    expect(screen.getByText("Contenido protegido")).toBeInTheDocument();
  });
});
