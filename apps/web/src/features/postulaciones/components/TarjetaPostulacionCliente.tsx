import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PostulacionVistaCliente } from "@fixeo/shared";
import {
  descartarPostulacion,
  postulacionesDePedidoQueryKey,
  revertirDescartePostulacion,
} from "../api";
import { ETIQUETAS_ESTADO_POSTULACION } from "../etiquetas";
import { formatearEstimacion } from "../lib/formato";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";
import { formatearAntiguedad } from "../../../lib/fecha-relativa";

interface TarjetaPostulacionClienteProps {
  pedidoId: string;
  postulacion: PostulacionVistaCliente;
}

function resumenReputacion(postulacion: PostulacionVistaCliente): string {
  if (postulacion.profesional.cantidadResenias === 0) return "Nuevo en Fixeo";
  const promedio = postulacion.profesional.promedioResenias?.toFixed(1) ?? "—";
  return `★ ${promedio} (${postulacion.profesional.cantidadResenias})`;
}

/** CL-08: tarjeta comparable de una postulacion, vista del cliente dueño del pedido. */
export function TarjetaPostulacionCliente({
  pedidoId,
  postulacion,
}: TarjetaPostulacionClienteProps) {
  const queryClient = useQueryClient();
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  function invalidar() {
    return queryClient.invalidateQueries({ queryKey: postulacionesDePedidoQueryKey(pedidoId) });
  }

  const mutacionDescartar = useMutation({
    mutationFn: () => descartarPostulacion(postulacion.id),
    onSuccess: () => {
      setConfirmandoDescarte(false);
      void invalidar();
    },
  });

  const mutacionRevertir = useMutation({
    mutationFn: () => revertirDescartePostulacion(postulacion.id),
    onSuccess: () => void invalidar(),
  });

  const nombreProfesional =
    [postulacion.profesional.nombre, postulacion.profesional.apellido].filter(Boolean).join(" ") ||
    "Profesional";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/profesionales/${postulacion.profesional.id}`}
          className="flex items-center gap-2 font-semibold text-teal-800 underline"
        >
          {postulacion.profesional.fotoUrl ? (
            <img
              src={urlCompletaApi(postulacion.profesional.fotoUrl)}
              alt=""
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500"
            >
              {nombreProfesional.charAt(0).toUpperCase()}
            </span>
          )}
          {nombreProfesional}
        </Link>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {ETIQUETAS_ESTADO_POSTULACION[postulacion.estado]}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        {resumenReputacion(postulacion)}
        {postulacion.profesional.aniosExperiencia !== null
          ? ` · ${postulacion.profesional.aniosExperiencia} años de experiencia`
          : ""}
      </p>

      <p className="text-sm text-slate-700">{postulacion.mensaje}</p>
      <p className="text-sm font-medium text-slate-900">
        {formatearEstimacion(postulacion.estimacion)}
      </p>
      {postulacion.disponibilidad && (
        <p className="text-sm text-slate-600">Disponibilidad: {postulacion.disponibilidad}</p>
      )}
      <p className="text-xs text-slate-500">Enviada {formatearAntiguedad(postulacion.enviadaEn)}</p>

      {postulacion.puedeDescartar && (
        <div className="flex flex-col gap-2">
          {!confirmandoDescarte ? (
            <button
              type="button"
              className="min-h-11 self-start text-sm font-semibold text-red-700 underline"
              onClick={() => setConfirmandoDescarte(true)}
            >
              Descartar
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-red-200 p-3">
              <p className="text-sm text-red-800">
                ¿Descartar esta postulación? Podés deshacerlo dentro de las próximas 24 h.
              </p>
              {mutacionDescartar.isError && (
                <p role="alert" className="text-sm text-red-700">
                  {mutacionDescartar.error instanceof ErrorApiHttp
                    ? mutacionDescartar.error.mensaje
                    : "No pudimos descartar la postulación."}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => setConfirmandoDescarte(false)}
                >
                  No, volver
                </Button>
                <Button
                  type="button"
                  variante="peligro"
                  cargando={mutacionDescartar.isPending}
                  onClick={() => mutacionDescartar.mutate()}
                >
                  Sí, descartar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {postulacion.puedeRevertirDescarte && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variante="secundario"
            cargando={mutacionRevertir.isPending}
            onClick={() => mutacionRevertir.mutate()}
          >
            Deshacer descarte
          </Button>
          {mutacionRevertir.isError && (
            <p role="alert" className="text-sm text-red-600">
              {mutacionRevertir.error instanceof ErrorApiHttp
                ? mutacionRevertir.error.mensaje
                : "No pudimos deshacer el descarte."}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
