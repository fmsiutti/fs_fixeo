import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PostulacionVistaCliente } from "@fixeo/shared";
import {
  descartarPostulacion,
  postulacionesDePedidoQueryKey,
  revertirDescartePostulacion,
  seleccionarPostulacion,
} from "../api";
import { ETIQUETAS_ESTADO_POSTULACION } from "../etiquetas";
import { formatearEstimacion, nombreCompleto, resumenReputacion } from "../lib/formato";
import { pedidoQueryKey } from "../../pedidos/api";
import { FormularioDenuncia } from "../../feed/components/FormularioDenuncia";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";
import { formatearAntiguedad } from "../../../lib/fecha-relativa";

interface TarjetaPostulacionClienteProps {
  pedidoId: string;
  postulacion: PostulacionVistaCliente;
  // D2/D3 (docs/dominio.md §4/§12): con el cupo de elegibles en 0 no hay que
  // ofrecer "Elegir", ni siquiera sobre una postulacion que volvio a "vista"
  // al revertir un descarte (esa postulacion no caduca sola: solo caducan
  // las que ya estaban enviada/vista cuando se completo el cupo).
  seleccionablesLibres: number;
}

// CL-08: solo se puede elegir una postulacion todavia viva (ni descartada,
// ni retirada, ni caducada, ni ya elegida).
const ESTADOS_ELEGIBLES = ["enviada", "vista"];

/** CL-08: tarjeta comparable de una postulacion, vista del cliente dueño del pedido. */
export function TarjetaPostulacionCliente({
  pedidoId,
  postulacion,
  seleccionablesLibres,
}: TarjetaPostulacionClienteProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [confirmandoEleccion, setConfirmandoEleccion] = useState(false);
  const [mostrarDenuncia, setMostrarDenuncia] = useState(false);
  const [denunciaEnviada, setDenunciaEnviada] = useState(false);

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

  // La eleccion cambia el estado (y cantidadContactos/seleccionablesLibres)
  // del pedido, ademas de la postulacion: se invalidan ambas queries antes
  // de navegar a CL-10 (docs/pantallas.md CL-08 -> CL-10).
  const mutacionElegir = useMutation({
    mutationFn: () => seleccionarPostulacion(postulacion.id),
    onSuccess: () => {
      void invalidar();
      void queryClient.invalidateQueries({ queryKey: pedidoQueryKey(pedidoId) });
      navigate(`/pedidos/${pedidoId}/contacto`);
    },
  });

  const nombreProfesional = nombreCompleto(postulacion.profesional, "Profesional");

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
        {resumenReputacion(postulacion.profesional)}
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

      {ESTADOS_ELEGIBLES.includes(postulacion.estado) && seleccionablesLibres > 0 && (
        <div className="flex flex-col gap-2">
          {!confirmandoEleccion ? (
            <Button type="button" onClick={() => setConfirmandoEleccion(true)}>
              Elegir a este profesional
            </Button>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3">
              <p className="text-sm text-teal-900">
                ¿Elegís a este profesional? Vas a poder ver su teléfono y coordinar por WhatsApp.
              </p>
              {mutacionElegir.isError && (
                <p role="alert" className="text-sm text-red-700">
                  {mutacionElegir.error instanceof ErrorApiHttp
                    ? mutacionElegir.error.mensaje
                    : "No pudimos elegir a este profesional. Probá de nuevo."}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => setConfirmandoEleccion(false)}
                >
                  No, volver
                </Button>
                <Button
                  type="button"
                  cargando={mutacionElegir.isPending}
                  onClick={() => mutacionElegir.mutate()}
                >
                  Sí, elegir
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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

      <div className="flex flex-col gap-2">
        {!mostrarDenuncia && !denunciaEnviada && (
          <button
            type="button"
            className="min-h-11 self-start text-xs font-semibold text-slate-500 underline"
            onClick={() => setMostrarDenuncia(true)}
          >
            Denunciar
          </button>
        )}
        {denunciaEnviada && (
          <p role="status" className="text-sm text-teal-700">
            Recibimos tu denuncia, la vamos a revisar.
          </p>
        )}
      </div>

      {mostrarDenuncia && (
        <FormularioDenuncia
          tipoObjeto="postulacion"
          objetoId={postulacion.id}
          onExito={() => {
            setMostrarDenuncia(false);
            setDenunciaEnviada(true);
          }}
          onCancelar={() => setMostrarDenuncia(false)}
        />
      )}
    </li>
  );
}
