import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BarrioAdminVista } from "@fixeo/shared";
import { barriosAdminQueryKey, editarBarrioAdmin } from "../api";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp } from "../../../lib/http";

interface FilaBarrioAdminProps {
  barrio: BarrioAdminVista;
  puedeEscribir: boolean;
}

/** AD-04 · un barrio del catalogo (D10: zona del piloto), con activar/desactivar. */
export function FilaBarrioAdmin({ barrio, puedeEscribir }: FilaBarrioAdminProps) {
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: editarBarrioAdmin,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: barriosAdminQueryKey }),
  });

  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{barrio.nombre}</span>
        <Badge tono={barrio.activo ? "exito" : "neutro"}>
          {barrio.activo ? "Activo" : "Inactivo"}
        </Badge>
      </div>
      {puedeEscribir && (
        <Button
          type="button"
          variante="secundario"
          className="w-auto px-4"
          cargando={mutacion.isPending}
          onClick={() => mutacion.mutate({ id: barrio.id, datos: { activo: !barrio.activo } })}
        >
          {barrio.activo ? "Desactivar" : "Activar"}
        </Button>
      )}
      {mutacion.isError && (
        <p role="alert" className="text-xs text-red-600">
          {mutacion.error instanceof ErrorApiHttp
            ? mutacion.error.mensaje
            : "No pudimos actualizar el barrio."}
        </p>
      )}
    </li>
  );
}
