import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { RolUsuario } from "@fixeo/shared";
import { useSesion } from "../features/auth/useSesion";

interface RutaConRolProps {
  roles: readonly RolUsuario[];
  children: ReactNode;
}

/**
 * Guard de ruta por rol_activo (apps/web/CLAUDE.md: "/admin/* exige moderador
 * o soporte; las rutas de profesional exigen rol_activo = profesional").
 * Sin sesion manda a /ingresar; con sesion pero con un rol_activo que no
 * matchea ninguno de los permitidos, manda a /.
 */
export function RutaConRol({ roles, children }: RutaConRolProps) {
  const { usuario } = useSesion();

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }
  if (!usuario.rolActivo || !roles.includes(usuario.rolActivo)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
