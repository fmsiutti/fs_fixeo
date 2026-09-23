import { createContext } from "react";
import type { UsuarioVista } from "@fixeo/shared";

export interface SesionContextValor {
  usuario: UsuarioVista | null;
  estaAutenticado: boolean;
  /** true mientras se intenta recuperar una sesion previa al abrir la app. */
  cargando: boolean;
  confirmarSesion: (usuario: UsuarioVista, accessToken: string) => void;
  cerrarSesion: () => void;
  actualizarUsuario: (parcial: Partial<UsuarioVista>) => void;
}

export const SesionContext = createContext<SesionContextValor | null>(null);
