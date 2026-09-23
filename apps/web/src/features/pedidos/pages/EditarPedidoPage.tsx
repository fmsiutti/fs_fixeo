import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DESCRIPCION_MAX,
  DESCRIPCION_MIN,
  FRANJAS,
  detectarDatosDeContacto,
  type EditarPedido,
  type Franja,
  type Urgencia,
} from "@fixeo/shared";
import {
  categoriasQueryKey,
  editarPedido,
  obtenerCategorias,
  obtenerPedido,
  pedidoQueryKey,
} from "../api";
import { useSesion } from "../../auth/useSesion";
import { ETIQUETAS_FRANJA, ETIQUETAS_URGENCIA } from "../etiquetas";
import { PreguntaGuia } from "../components/PreguntaGuia";
import { Button } from "../../../components/ui/Button";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";

const URGENCIAS_ORDENADAS: Urgencia[] = ["emergencia", "esta_semana", "sin_apuro"];

function textoErrorEditar(error: unknown): string {
  if (error instanceof ErrorApiHttp) {
    if (error.codigo === "conflicto") return "Este pedido ya no se puede editar.";
    if (error.codigo === "validacion") return error.mensaje;
  }
  return "No pudimos guardar los cambios. Probá de nuevo.";
}

/** CL-07 · Editar. Solo hasta la primera postulacion (docs/dominio.md §3); no toca direccion ni fotos. */
export function EditarPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const pedidoQuery = useQuery({
    queryKey: pedidoQueryKey(id ?? ""),
    queryFn: () => obtenerPedido(id ?? ""),
    enabled: Boolean(usuario) && Boolean(id),
  });
  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKey,
    queryFn: obtenerCategorias,
    staleTime: Infinity,
  });

  const pedido = pedidoQuery.data;
  const preguntasGuia =
    categoriasQuery.data?.find((categoria) => categoria.id === pedido?.categoria.id)
      ?.preguntasGuia ?? [];

  const [descripcion, setDescripcion] = useState<string | null>(null);
  const [respuestasGuia, setRespuestasGuia] = useState<Record<string, string> | null>(null);
  const [urgencia, setUrgencia] = useState<Urgencia | null>(null);
  const [franjas, setFranjas] = useState<Franja[] | null>(null);
  const [errorFranjas, setErrorFranjas] = useState<string | null>(null);
  const [errorEditar, setErrorEditar] = useState<string | null>(null);

  const mutacionEditar = useMutation({
    mutationFn: (input: EditarPedido) => editarPedido(id ?? "", input),
    onSuccess: (pedidoActualizado) => {
      queryClient.setQueryData(pedidoQueryKey(id ?? ""), pedidoActualizado);
      navigate(`/pedidos/${id}`, { replace: true });
    },
    onError: (error) => setErrorEditar(textoErrorEditar(error)),
  });

  if (!usuario) return <Navigate to="/ingresar" replace />;
  if (!id) return <Navigate to="/" replace />;
  if (pedidoQuery.isPending) return <Spinner etiqueta="Cargando tu pedido" />;
  if (pedidoQuery.isError || !pedido) return <Navigate to={`/pedidos/${id}`} replace />;
  // docs/dominio.md §3: "el pedido solo se edita hasta la primera postulacion".
  if (pedido.estado !== "publicado" || pedido.cantidadPostulaciones > 0) {
    return <Navigate to={`/pedidos/${id}`} replace />;
  }

  const descripcionActual = descripcion ?? pedido.descripcion;
  // Si el catalogo cambio las preguntas guia de la categoria desde que se
  // publico este pedido (AD-04), una respuesta vieja puede quedar huerfana:
  // se descarta en vez de mandarla al guardar y que el service la rechace sin
  // que esta pantalla la pueda mostrar para corregirla.
  const respuestasGuiaSinFiltrar = respuestasGuia ?? pedido.respuestasGuia ?? {};
  const respuestasGuiaActual = Object.fromEntries(
    Object.entries(respuestasGuiaSinFiltrar).filter(([pregunta]) =>
      preguntasGuia.includes(pregunta),
    ),
  );
  const urgenciaActual = urgencia ?? pedido.urgencia;
  const franjasActuales = franjas ?? pedido.franjas;

  const largo = descripcionActual.trim().length;
  const descripcionValida = largo >= DESCRIPCION_MIN && largo <= DESCRIPCION_MAX;
  const deteccionDescripcion = detectarDatosDeContacto(descripcionActual);

  function alternarFranja(franja: Franja) {
    setErrorFranjas(null);
    setFranjas(
      franjasActuales.includes(franja)
        ? franjasActuales.filter((item) => item !== franja)
        : [...franjasActuales, franja],
    );
  }

  function responderPregunta(pregunta: string, respuesta: string) {
    const siguientes = { ...respuestasGuiaActual };
    if (respuesta.trim()) {
      siguientes[pregunta] = respuesta;
    } else {
      delete siguientes[pregunta];
    }
    setRespuestasGuia(siguientes);
  }

  function guardar() {
    if (franjasActuales.length === 0) {
      setErrorFranjas("Elegí al menos una franja horaria");
      return;
    }
    setErrorEditar(null);
    mutacionEditar.mutate({
      descripcion: descripcionActual.trim(),
      respuestasGuia:
        Object.keys(respuestasGuiaActual).length > 0 ? respuestasGuiaActual : undefined,
      urgencia: urgenciaActual,
      franjas: franjasActuales,
    });
  }

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
        <h1 className="text-xl font-bold text-teal-800">Editar pedido</h1>
      </header>

      <div className="flex flex-col gap-2">
        <label htmlFor="descripcion" className="text-sm font-medium text-slate-700">
          Describí qué pasa
        </label>
        <textarea
          id="descripcion"
          rows={6}
          maxLength={DESCRIPCION_MAX}
          value={descripcionActual}
          onChange={(evento) => setDescripcion(evento.target.value)}
          className="min-h-32 rounded-lg border border-slate-300 p-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {descripcionValida ? "Longitud suficiente" : `Mínimo ${DESCRIPCION_MIN} caracteres`}
          </span>
          <span>
            {largo}/{DESCRIPCION_MAX}
          </span>
        </div>
        {deteccionDescripcion.detectado && (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Evitá compartir tu teléfono, email o redes acá.
          </p>
        )}
      </div>

      {preguntasGuia.map((pregunta) => (
        <PreguntaGuia
          key={pregunta}
          pregunta={pregunta}
          respuesta={respuestasGuiaActual[pregunta] ?? ""}
          onChange={(respuesta) => responderPregunta(pregunta, respuesta)}
        />
      ))}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">Urgencia</legend>
        <div className="flex flex-col gap-2">
          {URGENCIAS_ORDENADAS.map((opcion) => (
            <label
              key={opcion}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-300 px-3 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50"
            >
              <input
                type="radio"
                name="urgencia"
                value={opcion}
                checked={urgenciaActual === opcion}
                onChange={() => setUrgencia(opcion)}
              />
              <span className="text-sm font-medium text-slate-800">
                {ETIQUETAS_URGENCIA[opcion]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">Franjas horarias</legend>
        <div className="flex flex-col gap-2">
          {FRANJAS.map((franja) => (
            <label
              key={franja}
              className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-300 px-3 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50"
            >
              <input
                type="checkbox"
                checked={franjasActuales.includes(franja)}
                onChange={() => alternarFranja(franja)}
              />
              <span className="text-sm font-medium text-slate-800">{ETIQUETAS_FRANJA[franja]}</span>
            </label>
          ))}
        </div>
        {errorFranjas && (
          <p role="alert" className="text-sm text-red-600">
            {errorFranjas}
          </p>
        )}
      </fieldset>

      {errorEditar && (
        <p role="alert" className="text-sm text-red-600">
          {errorEditar}
        </p>
      )}

      <Button
        type="button"
        onClick={guardar}
        disabled={!descripcionValida}
        cargando={mutacionEditar.isPending}
      >
        Guardar cambios
      </Button>
    </main>
  );
}
