import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  crearPostulacionSchema,
  detectarDatosDeContacto,
  estimacionPostulacionSchema,
  PLANTILLAS_MENSAJE_MAX_POR_PERFIL,
  type CrearPostulacion,
  type EstimacionPostulacionInput,
} from "@fixeo/shared";
import { detalleFeedTrabajoQueryKey, obtenerDetalleFeedTrabajo } from "../../feed/api";
import { ETIQUETAS_URGENCIA } from "../../pedidos/etiquetas";
import {
  contadorDiarioPostulacionesQueryKey,
  crearPlantillaMensaje,
  crearPostulacion,
  obtenerContadorDiarioPostulaciones,
  obtenerPlantillasMensaje,
  plantillasMensajeQueryKey,
  registrarPostulacionIniciada,
} from "../api";
import { guardarBorradorMensaje, leerBorradorMensaje, limpiarBorradorMensaje } from "../borrador";
import { formatearHoraRenovacion } from "../lib/formato";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";

type CamposMensaje = Pick<CrearPostulacion, "mensaje" | "disponibilidad">;

const CAMPOS_MENSAJE_SCHEMA = crearPostulacionSchema.pick({ mensaje: true, disponibilidad: true });

const normalizarDisponibilidad = (valor: string): string | undefined =>
  valor === "" ? undefined : valor;

type ModoEstimacion = "rango" | "a_definir";

interface ErrorPostularme {
  mensaje: string;
  irAlPerfil: boolean;
}

function textoErrorPostularme(error: unknown): ErrorPostularme {
  if (error instanceof ErrorApiHttp) {
    if (error.codigo === "no_autorizado") {
      return { mensaje: error.mensaje, irAlPerfil: true };
    }
    return { mensaje: error.mensaje, irAlPerfil: false };
  }
  return { mensaje: "No pudimos enviar tu postulación. Probá de nuevo.", irAlPerfil: false };
}

/** PR-04 · Postularme. */
export function PostularmePage() {
  const { id } = useParams<{ id: string }>();
  const pedidoId = id ?? "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [modoEstimacion, setModoEstimacion] = useState<ModoEstimacion>("rango");
  const [minimoTexto, setMinimoTexto] = useState("");
  const [maximoTexto, setMaximoTexto] = useState("");
  const [errorEstimacion, setErrorEstimacion] = useState<string | null>(null);

  const pedidoQuery = useQuery({
    queryKey: detalleFeedTrabajoQueryKey(pedidoId),
    queryFn: () => obtenerDetalleFeedTrabajo(pedidoId),
    enabled: Boolean(pedidoId),
    retry: false,
  });

  const contadorQuery = useQuery({
    queryKey: contadorDiarioPostulacionesQueryKey,
    queryFn: obtenerContadorDiarioPostulaciones,
    retry: false,
  });

  const plantillasQuery = useQuery({
    queryKey: plantillasMensajeQueryKey,
    queryFn: obtenerPlantillasMensaje,
    retry: false,
  });

  const form = useForm<CamposMensaje>({
    resolver: zodResolver(CAMPOS_MENSAJE_SCHEMA),
    defaultValues: { mensaje: leerBorradorMensaje(pedidoId), disponibilidad: undefined },
  });

  const mensajeActual = useWatch({ control: form.control, name: "mensaje" }) ?? "";
  const deteccionMensaje = useMemo(() => detectarDatosDeContacto(mensajeActual), [mensajeActual]);

  // PR-04 (revision de codigo del slice 6): mide cuantos profesionales entran
  // a postularse aunque despues no envien el formulario. Solo analitica: no
  // bloquea el render ni muestra error si falla (mismo criterio que
  // `registrarEvento` del asistente de pedido).
  useEffect(() => {
    if (!pedidoId) return;
    registrarPostulacionIniciada({ pedidoId }).catch(() => undefined);
  }, [pedidoId]);

  const mutacionPostular = useMutation({
    mutationFn: crearPostulacion,
    onSuccess: () => {
      limpiarBorradorMensaje(pedidoId);
      navigate("/postulaciones", { state: { postulacionEnviada: true } });
    },
  });

  const mutacionGuardarPlantilla = useMutation({
    mutationFn: crearPlantillaMensaje,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plantillasMensajeQueryKey });
    },
  });

  if (!pedidoId) {
    return <Navigate to="/trabajos" replace />;
  }

  function elegirPlantilla(texto: string) {
    const actual = form.getValues("mensaje");
    if (actual && actual.trim().length > 0 && actual !== texto) {
      const reemplazar = window.confirm(
        "Ya escribiste un mensaje. ¿Reemplazarlo por esta plantilla? Después podés seguir editándolo.",
      );
      if (!reemplazar) return;
    }
    form.setValue("mensaje", texto, { shouldValidate: true, shouldDirty: true });
    guardarBorradorMensaje(pedidoId, texto);
  }

  function enviar(datos: CamposMensaje) {
    setErrorEstimacion(null);

    if (modoEstimacion === "rango" && (minimoTexto.trim() === "" || maximoTexto.trim() === "")) {
      setErrorEstimacion("Completá el mínimo y el máximo del rango estimado");
      return;
    }

    const estimacionCandidata: EstimacionPostulacionInput =
      modoEstimacion === "a_definir"
        ? { aDefinir: true }
        : { aDefinir: false, minimo: Number(minimoTexto), maximo: Number(maximoTexto) };

    const resultado = estimacionPostulacionSchema.safeParse(estimacionCandidata);
    if (!resultado.success) {
      setErrorEstimacion(resultado.error.issues[0]?.message ?? "Revisá la estimación");
      return;
    }

    mutacionPostular.mutate({
      pedidoId,
      mensaje: datos.mensaje,
      estimacion: resultado.data,
      disponibilidad: datos.disponibilidad,
    });
  }

  const pedido = pedidoQuery.data;
  const contador = contadorQuery.data;
  const plantillas = plantillasQuery.data ?? [];
  const limiteDiarioAlcanzado = contador ? contador.usadas >= contador.maximo : false;
  const errorPostular = mutacionPostular.isError
    ? textoErrorPostularme(mutacionPostular.error)
    : null;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center gap-2">
        <Link
          to={`/trabajos/${pedidoId}`}
          aria-label="Volver al detalle del pedido"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Postularme</h1>
      </header>

      {pedidoQuery.isPending && <Spinner etiqueta="Cargando el pedido" />}

      {pedidoQuery.isError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">No pudimos cargar este pedido.</p>
          <button
            type="button"
            className="min-h-11 font-semibold underline"
            onClick={() => pedidoQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      )}

      {pedido && (
        <>
          <section className="flex flex-col gap-1 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">{pedido.categoria.nombre}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {ETIQUETAS_URGENCIA[pedido.urgencia]}
              </span>
            </div>
            <p className="line-clamp-3 text-sm text-slate-700">{pedido.descripcion}</p>
          </section>

          {contadorQuery.isPending && (
            <p className="text-sm text-slate-500">Cargando tu contador diario…</p>
          )}
          {contadorQuery.isError && (
            <p className="text-sm text-slate-500">No pudimos cargar tu contador diario.</p>
          )}
          {contador && (
            <p
              role="status"
              className={
                limiteDiarioAlcanzado
                  ? "rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                  : "text-sm text-slate-600"
              }
            >
              Usaste {contador.usadas} de {contador.maximo} postulaciones hoy. Se renueva a las{" "}
              {formatearHoraRenovacion(contador.renuevaEn)}.
            </p>
          )}

          <form noValidate onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="mensaje" className="text-sm font-medium text-slate-700">
                Mensaje para el cliente
              </label>
              <textarea
                id="mensaje"
                rows={5}
                placeholder="Contale al cliente cómo podés ayudarlo..."
                aria-invalid={Boolean(form.formState.errors.mensaje)}
                aria-describedby={form.formState.errors.mensaje ? "mensaje-error" : undefined}
                className="min-h-32 rounded-lg border border-slate-300 p-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                {...form.register("mensaje", {
                  onChange: (evento: ChangeEvent<HTMLTextAreaElement>) =>
                    guardarBorradorMensaje(pedidoId, evento.target.value),
                })}
              />
              {form.formState.errors.mensaje && (
                <p id="mensaje-error" role="alert" className="text-sm text-red-600">
                  {form.formState.errors.mensaje.message}
                </p>
              )}
              {deteccionMensaje.detectado && (
                <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Por tu seguridad, no compartas tu teléfono, email o redes en el mensaje. Se lo vas
                  a poder dar directo al cliente si te elige.
                </p>
              )}

              <Button
                type="button"
                variante="secundario"
                disabled={
                  mensajeActual.trim().length === 0 ||
                  plantillas.length >= PLANTILLAS_MENSAJE_MAX_POR_PERFIL
                }
                cargando={mutacionGuardarPlantilla.isPending}
                onClick={() => mutacionGuardarPlantilla.mutate({ texto: mensajeActual.trim() })}
              >
                Guardar como plantilla
              </Button>
              {plantillas.length >= PLANTILLAS_MENSAJE_MAX_POR_PERFIL && (
                <p className="text-xs text-slate-500">
                  Llegaste al máximo de plantillas guardadas ({PLANTILLAS_MENSAJE_MAX_POR_PERFIL}).
                </p>
              )}
              {mutacionGuardarPlantilla.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {mutacionGuardarPlantilla.error instanceof ErrorApiHttp
                    ? mutacionGuardarPlantilla.error.mensaje
                    : "No pudimos guardar la plantilla."}
                </p>
              )}
            </div>

            {plantillasQuery.isPending && <Spinner etiqueta="Cargando tus plantillas" />}
            {plantillas.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">Tus plantillas</span>
                <ul className="flex flex-col gap-2">
                  {plantillas.map((plantilla) => (
                    <li key={plantilla.id}>
                      <button
                        type="button"
                        onClick={() => elegirPlantilla(plantilla.texto)}
                        className="w-full rounded-lg border border-slate-200 p-3 text-left text-sm text-slate-700 hover:border-teal-700 hover:bg-teal-50"
                      >
                        {plantilla.texto}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-slate-700">Estimación</legend>
              <div className="flex gap-3">
                {(["rango", "a_definir"] as const).map((opcion) => (
                  <label
                    key={opcion}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-2 text-center text-sm font-medium text-slate-700 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800"
                  >
                    <input
                      type="radio"
                      name="modo-estimacion"
                      value={opcion}
                      checked={modoEstimacion === opcion}
                      onChange={() => {
                        setModoEstimacion(opcion);
                        setErrorEstimacion(null);
                      }}
                      className="sr-only"
                    />
                    {opcion === "rango" ? "Rango estimado" : "A definir en la visita"}
                  </label>
                ))}
              </div>

              {modoEstimacion === "rango" && (
                <div className="flex gap-3">
                  <Field
                    label="Mínimo"
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1}
                    value={minimoTexto}
                    onChange={(evento) => setMinimoTexto(evento.target.value)}
                  />
                  <Field
                    label="Máximo"
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1}
                    value={maximoTexto}
                    onChange={(evento) => setMaximoTexto(evento.target.value)}
                  />
                </div>
              )}

              {errorEstimacion && (
                <p role="alert" className="text-sm text-red-600">
                  {errorEstimacion}
                </p>
              )}
            </fieldset>

            <Field
              label="Disponibilidad (opcional)"
              placeholder="Ej: puedo ir mañana a la tarde"
              error={form.formState.errors.disponibilidad?.message}
              {...form.register("disponibilidad", { setValueAs: normalizarDisponibilidad })}
            />

            {errorPostular && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              >
                <p>{errorPostular.mensaje}</p>
                {errorPostular.irAlPerfil && (
                  <Link to="/perfil" className="font-semibold underline">
                    Ir a mi perfil
                  </Link>
                )}
              </div>
            )}

            <Button
              type="submit"
              cargando={mutacionPostular.isPending}
              disabled={limiteDiarioAlcanzado}
            >
              Enviar postulación
            </Button>
          </form>
        </>
      )}
    </main>
  );
}
