import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DenunciaModeracionVista } from "@fixeo/shared";
import { denunciasModeracionQueryKey, resolverDenunciaModeracion } from "../api";
import { ETIQUETAS_TIPO_OBJETO_DENUNCIA } from "../etiquetas";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp } from "../../../lib/http";

interface ItemDenunciaModeracionProps {
  item: DenunciaModeracionVista;
  puedeResolver: boolean;
}

/**
 * AD-02, tercera cola (D14): denuncias de perfil/postulacion/resenia. Para
 * resenia, "resolver" oculta la reseña definitivamente (no la borra, pero
 * deja de mostrarse y de contar en el promedio); el texto de los botones lo
 * transmite ("Ocultar reseña" / "Mantener") en vez del generico
 * "Resolver" / "Descartar" que usan perfil y postulacion.
 */
export function ItemDenunciaModeracion({ item, puedeResolver }: ItemDenunciaModeracionProps) {
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: resolverDenunciaModeracion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: denunciasModeracionQueryKey });
    },
  });

  const reportante =
    [item.reportante.nombre, item.reportante.apellido].filter(Boolean).join(" ") ||
    "Usuario de Fixeo";

  const esResenia = item.tipoObjeto === "resenia";
  const etiquetaResolver = esResenia ? "Ocultar reseña" : "Resolver";
  const etiquetaDescartar = esResenia ? "Mantener" : "Descartar";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge tono="neutro">{ETIQUETAS_TIPO_OBJETO_DENUNCIA[item.tipoObjeto]}</Badge>
        <span className="text-xs text-slate-500">
          {new Date(item.creadoEn).toLocaleString("es-AR")}
        </span>
      </div>

      <p className="font-semibold text-slate-900">{item.resumen}</p>
      <p className="text-sm text-slate-700">
        <span className="font-medium">{item.motivo}</span>
        {item.detalle && <span> — {item.detalle}</span>}
      </p>
      <p className="text-xs text-slate-500">Denunciado por {reportante}</p>

      {item.usuarioId && (
        <Link
          to={`/admin/usuarios/${item.usuarioId}`}
          className="min-h-11 self-start text-sm font-semibold text-teal-800 underline"
        >
          Ver usuario en AD-03
        </Link>
      )}

      {mutacion.isError && (
        <p role="alert" className="text-sm text-red-600">
          {mutacion.error instanceof ErrorApiHttp
            ? mutacion.error.mensaje
            : "No pudimos resolver esta denuncia. Probá de nuevo."}
        </p>
      )}

      {puedeResolver && (
        <div className="flex gap-3">
          <Button
            type="button"
            variante="secundario"
            cargando={mutacion.isPending && mutacion.variables?.datos.accion === "descartar"}
            onClick={() => mutacion.mutate({ id: item.id, datos: { accion: "descartar" } })}
          >
            {etiquetaDescartar}
          </Button>
          <Button
            type="button"
            variante="peligro"
            cargando={mutacion.isPending && mutacion.variables?.datos.accion === "resolver"}
            onClick={() => mutacion.mutate({ id: item.id, datos: { accion: "resolver" } })}
          >
            {etiquetaResolver}
          </Button>
        </div>
      )}
    </li>
  );
}
