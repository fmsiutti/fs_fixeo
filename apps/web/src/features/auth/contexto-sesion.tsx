import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UsuarioVista } from "@fixeo/shared";
import { registrarManejadorSesionExpirada, setAccessToken } from "../../lib/http";
import { refrescarSesion } from "./api";
import { SesionContext, type SesionContextValor } from "./SesionContext";

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioVista | null>(null);
  const [cargando, setCargando] = useState(true);

  // Excepcion legitima de inicializacion (no deriva estado ni pide datos de UI):
  // al montar la app intentamos revalidar la cookie de refresh en silencio.
  useEffect(() => {
    let vigente = true;

    registrarManejadorSesionExpirada(() => {
      if (vigente) setUsuario(null);
    });

    refrescarSesion()
      .then((datos) => {
        if (!vigente) return;
        setAccessToken(datos.accessToken);
        setUsuario(datos.usuario);
      })
      .catch(() => {
        // No habia sesion previa o vencio: es el caso normal, sin error visible.
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
      registrarManejadorSesionExpirada(null);
    };
  }, []);

  const confirmarSesion = useCallback((usuarioNuevo: UsuarioVista, accessToken: string) => {
    setAccessToken(accessToken);
    setUsuario(usuarioNuevo);
  }, []);

  const cerrarSesion = useCallback(() => {
    setAccessToken(null);
    setUsuario(null);
  }, []);

  const actualizarUsuario = useCallback((parcial: Partial<UsuarioVista>) => {
    setUsuario((actual) => (actual ? { ...actual, ...parcial } : actual));
  }, []);

  const valor = useMemo<SesionContextValor>(
    () => ({
      usuario,
      estaAutenticado: usuario !== null,
      cargando,
      confirmarSesion,
      cerrarSesion,
      actualizarUsuario,
    }),
    [usuario, cargando, confirmarSesion, cerrarSesion, actualizarUsuario],
  );

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}
