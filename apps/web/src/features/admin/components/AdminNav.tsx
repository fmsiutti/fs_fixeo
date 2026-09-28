import { NavLink } from "react-router-dom";

const SECCIONES = [
  { to: "/admin", etiqueta: "Tablero", fin: true },
  { to: "/admin/pedidos", etiqueta: "Pedidos", fin: false },
  { to: "/admin/verificaciones", etiqueta: "Verificaciones", fin: false },
  { to: "/admin/usuarios", etiqueta: "Usuarios", fin: false },
  { to: "/admin/catalogo", etiqueta: "Catálogo", fin: false },
] as const;

/** Barra de navegacion compartida por las 5 pantallas del back office (AD-01 a AD-05). */
export function AdminNav() {
  return (
    <nav aria-label="Back office" className="-mx-6 overflow-x-auto border-b border-slate-200 px-6">
      <ul className="flex gap-4 text-sm font-semibold whitespace-nowrap">
        {SECCIONES.map((seccion) => (
          <li key={seccion.to}>
            <NavLink
              to={seccion.to}
              end={seccion.fin}
              className={({ isActive }) =>
                `flex min-h-11 items-center border-b-2 px-1 ${
                  isActive
                    ? "border-teal-700 text-teal-800"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`
              }
            >
              {seccion.etiqueta}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
