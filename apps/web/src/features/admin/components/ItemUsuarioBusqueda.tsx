import { Link } from "react-router-dom";
import type { UsuarioBusquedaItemVista } from "@fixeo/shared";
import { ETIQUETAS_ESTADO_USUARIO } from "../etiquetas";
import { Badge, type TonoBadge } from "../../../components/ui/Badge";

const TONOS_ESTADO: Record<UsuarioBusquedaItemVista["estado"], TonoBadge> = {
  activo: "exito",
  suspendido: "advertencia",
  eliminado: "error",
};

interface ItemUsuarioBusquedaProps {
  usuario: UsuarioBusquedaItemVista;
}

/** AD-03 · una fila de resultado de busqueda de usuarios, con link al detalle. */
export function ItemUsuarioBusqueda({ usuario }: ItemUsuarioBusquedaProps) {
  const nombreCompleto =
    [usuario.nombre, usuario.apellido].filter(Boolean).join(" ") || "Usuario sin nombre";

  return (
    <li>
      <Link
        to={`/admin/usuarios/${usuario.id}`}
        className="flex min-h-11 flex-col gap-1 rounded-2xl border border-slate-200 p-4 hover:border-teal-300"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-900">{nombreCompleto}</span>
          <Badge tono={TONOS_ESTADO[usuario.estado]}>
            {ETIQUETAS_ESTADO_USUARIO[usuario.estado]}
          </Badge>
        </div>
        <p className="text-sm text-slate-600">{usuario.telefono}</p>
        <p className="text-xs text-slate-500">
          {usuario.rolActivo ?? "Sin rol activo"} · alta{" "}
          {new Date(usuario.creadoEn).toLocaleDateString("es-AR")}
        </p>
      </Link>
    </li>
  );
}
