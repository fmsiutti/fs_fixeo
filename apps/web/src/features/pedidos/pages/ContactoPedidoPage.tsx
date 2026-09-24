import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ContactoVistaCliente } from "@fixeo/shared";
import { useSesion } from "../../auth/useSesion";
import {
  contactoDelPedidoQueryKey,
  obtenerContactoDelPedido,
  obtenerPedido,
  pedidoQueryKey,
} from "../api";
import { registrarEventoContacto } from "../../postulaciones/api";
import { ETIQUETAS_ESTADO_POSTULACION } from "../../postulaciones/etiquetas";
import {
  formatearEstimacion,
  nombreCompleto,
  resumenReputacion,
} from "../../postulaciones/lib/formato";
import { pluralizarLugares } from "../../feed/lib/formato";
import { armarUrlWhatsapp } from "../../../lib/whatsapp";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp, urlCompletaApi } from "../../../lib/http";

const CONSEJOS_SEGURIDAD = [
  "Coordiná el pago y los detalles del trabajo directamente con el profesional.",
  "Fixeo no participa del trabajo ni garantiza el resultado.",
  "Si algo no te da confianza, podés denunciar el perfil desde su ficha.",
];

interface BloqueContactoProps {
  contacto: ContactoVistaCliente;
  categoriaNombre: string;
}

function BloqueContacto({ contacto, categoriaNombre }: BloqueContactoProps) {
  const [copiado, setCopiado] = useState(false);
  const nombreProfesional = nombreCompleto(contacto.profesional, "Profesional");
  const retirada = contacto.estadoPostulacion === "retirada";

  const mensajeWhatsapp = `Hola${
    nombreProfesional !== "Profesional" ? ` ${nombreProfesional}` : ""
  }! Te escribo por tu postulación al pedido de ${categoriaNombre} en Fixeo.`;

  async function copiarTelefono() {
    try {
      await navigator.clipboard.writeText(contacto.profesional.telefono);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  // docs/dominio.md §10: eventos de analitica whatsapp_abierto/llamada_iniciada.
  // Se dispara en el click, sin esperar la respuesta ni bloquear la navegacion
  // al link tel:/wa.me (mismo criterio que registrarEvento del asistente).
  function dispararEvento(tipo: "whatsapp_abierto" | "llamada_iniciada") {
    registrarEventoContacto(contacto.postulacionId, tipo).catch(() => {
      // Un evento de analitica que falla no puede interrumpir la coordinacion real.
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/profesionales/${contacto.profesional.id}`}
          className="flex items-center gap-2 font-semibold text-teal-800 underline"
        >
          {contacto.profesional.fotoUrl ? (
            <img
              src={urlCompletaApi(contacto.profesional.fotoUrl)}
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
          {ETIQUETAS_ESTADO_POSTULACION[contacto.estadoPostulacion]}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        {resumenReputacion(contacto.profesional)}
        {contacto.profesional.aniosExperiencia !== null
          ? ` · ${contacto.profesional.aniosExperiencia} años de experiencia`
          : ""}
      </p>

      <p className="text-sm text-slate-700">{contacto.mensaje}</p>
      <p className="text-sm font-medium text-slate-900">
        {formatearEstimacion(contacto.estimacion)}
      </p>

      {retirada ? (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
          Este profesional no puede tomar tu pedido. Su teléfono sigue abajo por si ya habían
          coordinado algo.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-600">Teléfono: {contacto.profesional.telefono}</p>
        {/* Reveal simultaneo (apps/web/CLAUDE.md): el telefono ya revelado
            nunca se oculta con CSS. Pero si el profesional ya avisó que no
            puede tomar el pedido, no tiene sentido invitar a "coordinar":
            se sacan los botones en vez de deshabilitarlos con CSS (seguian
            siendo tabulables y activables con Enter). */}
        <div className="flex flex-wrap gap-3">
          {!retirada && (
            <>
              <a
                href={`tel:${contacto.profesional.telefono}`}
                onClick={() => dispararEvento("llamada_iniciada")}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Llamar
              </a>
              <a
                href={armarUrlWhatsapp(contacto.profesional.telefono, mensajeWhatsapp)}
                target="_blank"
                rel="noreferrer"
                onClick={() => dispararEvento("whatsapp_abierto")}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
              >
                WhatsApp
              </a>
            </>
          )}
          <button
            type="button"
            onClick={copiarTelefono}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Copiar
          </button>
        </div>
        {copiado && (
          <p role="status" className="text-sm text-teal-700">
            Copiamos el número.
          </p>
        )}
      </div>
    </li>
  );
}

/** CL-10 · Contacto habilitado. Requiere sesion (los contactos son del cliente dueño del pedido). */
export function ContactoPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useSesion();

  const pedidoQuery = useQuery({
    queryKey: pedidoQueryKey(id ?? ""),
    queryFn: () => obtenerPedido(id ?? ""),
    enabled: Boolean(usuario) && Boolean(id),
  });

  const contactosQuery = useQuery({
    queryKey: contactoDelPedidoQueryKey(id ?? ""),
    queryFn: () => obtenerContactoDelPedido(id ?? ""),
    enabled: Boolean(usuario) && Boolean(id),
  });

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }
  if (!id) {
    return <Navigate to="/" replace />;
  }

  const pedido = pedidoQuery.data;
  const contactos = contactosQuery.data;
  const cargando = pedidoQuery.isPending || contactosQuery.isPending;
  const hayError = pedidoQuery.isError || contactosQuery.isError;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center gap-2">
        <Link
          to={`/pedidos/${id}`}
          aria-label="Volver al pedido"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Contacto habilitado</h1>
      </header>

      {cargando && <Spinner etiqueta="Cargando el contacto" />}

      {hayError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">
            {pedidoQuery.error instanceof ErrorApiHttp &&
            pedidoQuery.error.codigo === "no_encontrado"
              ? "Este pedido no existe o no es tuyo."
              : "No pudimos cargar el contacto."}
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              className="min-h-11 font-semibold underline"
              onClick={() => {
                void pedidoQuery.refetch();
                void contactosQuery.refetch();
              }}
            >
              Reintentar
            </button>
            <Link
              to={`/pedidos/${id}`}
              className="flex min-h-11 items-center font-semibold underline"
            >
              Volver al pedido
            </Link>
          </div>
        </div>
      )}

      {contactos && contactos.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center">
          <p className="text-slate-700">
            Todavía no elegiste a ningún profesional para este pedido.
          </p>
          <Link to={`/pedidos/${id}`} className="min-h-11 font-semibold text-teal-800 underline">
            Ver las postulaciones
          </Link>
        </div>
      )}

      {contactos && contactos.length > 0 && (
        <>
          <ul className="flex flex-col gap-4">
            {contactos.map((contacto) => (
              <BloqueContacto
                key={contacto.id}
                contacto={contacto}
                categoriaNombre={pedido?.categoria.nombre ?? "tu pedido"}
              />
            ))}
          </ul>

          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Consejos de seguridad</h2>
            <ul className="flex flex-col gap-2 text-sm text-slate-700">
              {CONSEJOS_SEGURIDAD.map((consejo) => (
                <li key={consejo} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  {consejo}
                </li>
              ))}
            </ul>
          </section>

          {/* CL-10: "a las 48h sin respuesta... ofrecer cerrar y republicar" (D3). Este
              slice no agrega el gating por horas: un link simple a CL-11 alcanza. */}
          <Link
            to={`/pedidos/${id}/cerrar`}
            className="flex min-h-11 items-center justify-center rounded-full border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50"
          >
            Cerrar pedido
          </Link>

          {pedido && pedido.seleccionablesLibres > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {(() => {
                const { sustantivo, verbo } = pluralizarLugares(pedido.seleccionablesLibres);
                return `Todavía te ${verbo} ${sustantivo} para elegir a otro profesional. `;
              })()}
              <Link to={`/pedidos/${id}`} className="font-semibold underline">
                Volver a las postulaciones
              </Link>
            </p>
          )}

          {pedido && pedido.seleccionablesLibres === 0 && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Ya elegiste a los profesionales para este pedido.
            </p>
          )}
        </>
      )}
    </main>
  );
}
