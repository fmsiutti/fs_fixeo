import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  contactoElegidoQueryKey,
  noPuedoTomarloPostulacion,
  obtenerContactoElegido,
  registrarEventoContacto,
} from "../api";
import { nombreCompleto } from "../lib/formato";
import { ETIQUETAS_FRANJA, ETIQUETAS_URGENCIA } from "../../pedidos/etiquetas";
import { armarUrlWhatsapp } from "../../../lib/whatsapp";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";

function armarUrlComoLlegar(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function armarDireccion(direccion: {
  calle: string;
  numero: string;
  piso: string | null;
  depto: string | null;
}): string {
  const partes = [`${direccion.calle} ${direccion.numero}`];
  if (direccion.piso) partes.push(`piso ${direccion.piso}`);
  if (direccion.depto) partes.push(`depto ${direccion.depto}`);
  return partes.join(", ");
}

/** PR-06 · Te eligieron. Requiere rol profesional (guard en routes.tsx). */
export function TeEligieronPage() {
  const { id } = useParams<{ id: string }>();
  const postulacionId = id ?? "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false);

  const contactoQuery = useQuery({
    queryKey: contactoElegidoQueryKey(postulacionId),
    queryFn: () => obtenerContactoElegido(postulacionId),
    enabled: Boolean(postulacionId),
  });

  const mutacionNoPuedo = useMutation({
    mutationFn: () => noPuedoTomarloPostulacion(postulacionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactoElegidoQueryKey(postulacionId) });
      // Mismo prefijo que usa MisPostulacionesPage: la postulacion se mueve
      // de "seleccionadas" a "cerradas".
      void queryClient.invalidateQueries({ queryKey: ["postulaciones"] });
      navigate("/postulaciones");
    },
  });

  if (!postulacionId) {
    return <Navigate to="/postulaciones" replace />;
  }

  function dispararEvento(tipo: "whatsapp_abierto" | "llamada_iniciada") {
    registrarEventoContacto(postulacionId, tipo).catch(() => undefined);
  }

  const contacto = contactoQuery.data;
  const nombreCliente = contacto ? nombreCompleto(contacto.cliente, "El cliente") : "";
  const yaRechazaste = contacto?.estadoPostulacion === "retirada";

  const mensajeWhatsapp = contacto
    ? `Hola${nombreCliente !== "El cliente" ? ` ${nombreCliente}` : ""}! Soy el profesional que elegiste en Fixeo para tu pedido de ${contacto.pedido.categoria.nombre}. Te escribo para coordinar.`
    : "";

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center gap-2">
        <Link
          to="/postulaciones"
          aria-label="Volver a mis postulaciones"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Te eligieron</h1>
      </header>

      {contactoQuery.isPending && <Spinner etiqueta="Cargando el contacto" />}

      {contactoQuery.isError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">
            {contactoQuery.error instanceof ErrorApiHttp &&
            contactoQuery.error.codigo === "no_encontrado"
              ? "No encontramos este contacto."
              : "No pudimos cargar el contacto."}
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              className="min-h-11 font-semibold underline"
              onClick={() => contactoQuery.refetch()}
            >
              Reintentar
            </button>
            <Link
              to="/postulaciones"
              className="flex min-h-11 items-center font-semibold underline"
            >
              Volver a mis postulaciones
            </Link>
          </div>
        </div>
      )}

      {contacto && (
        <>
          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
            <span className="font-semibold text-slate-900">{contacto.pedido.categoria.nombre}</span>
            <p className="text-sm text-slate-700">{contacto.pedido.descripcion}</p>
            <dl className="flex flex-col gap-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>Urgencia</dt>
                <dd className="font-medium text-slate-900">
                  {ETIQUETAS_URGENCIA[contacto.pedido.urgencia]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Franjas</dt>
                <dd className="font-medium text-slate-900">
                  {contacto.pedido.franjas
                    .map((franja) => ETIQUETAS_FRANJA[franja] ?? franja)
                    .join(", ")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900">{nombreCliente}</h2>
            <p className="text-sm text-slate-700">
              {armarDireccion(contacto.cliente.direccion)}, {contacto.cliente.barrio.nombre}
            </p>
            <p className="text-sm text-slate-600">Teléfono: {contacto.cliente.telefono}</p>
          </section>

          {contacto.hayOtrosElegidos && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              El cliente también eligió a otros profesionales para este pedido.
            </p>
          )}

          {yaRechazaste ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              Ya le avisaste al cliente que no podés tomar este trabajo.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`tel:${contacto.cliente.telefono}`}
                  onClick={() => dispararEvento("llamada_iniciada")}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Llamar
                </a>
                <a
                  href={armarUrlWhatsapp(contacto.cliente.telefono, mensajeWhatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => dispararEvento("whatsapp_abierto")}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                >
                  WhatsApp
                </a>
                <a
                  href={armarUrlComoLlegar(
                    contacto.cliente.direccion.lat,
                    contacto.cliente.direccion.lng,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cómo llegar
                </a>
              </div>

              <div className="flex flex-col gap-2">
                {!confirmandoRechazo ? (
                  <button
                    type="button"
                    className="min-h-11 self-start text-sm font-semibold text-red-700 underline"
                    onClick={() => setConfirmandoRechazo(true)}
                  >
                    No puedo tomarlo
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-xl border border-red-200 p-3">
                    <p className="text-sm text-red-800">
                      ¿Le avisamos al cliente que no podés tomar este trabajo? No se puede deshacer.
                    </p>
                    {mutacionNoPuedo.isError && (
                      <p role="alert" className="text-sm text-red-700">
                        {mutacionNoPuedo.error instanceof ErrorApiHttp
                          ? mutacionNoPuedo.error.mensaje
                          : "No pudimos avisarle al cliente. Probá de nuevo."}
                      </p>
                    )}
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variante="secundario"
                        onClick={() => setConfirmandoRechazo(false)}
                      >
                        No, volver
                      </Button>
                      <Button
                        type="button"
                        variante="peligro"
                        cargando={mutacionNoPuedo.isPending}
                        onClick={() => mutacionNoPuedo.mutate()}
                      >
                        Sí, no puedo tomarlo
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
