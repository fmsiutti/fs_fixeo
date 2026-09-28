import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cerrarPedidoSchema,
  DESENLACES,
  reseniaAlCerrarSchema,
  type CerrarPedido,
  type Desenlace,
  type ReseniaAlCerrar,
} from "@fixeo/shared";
import { useSesion } from "../../auth/useSesion";
import {
  cerrarPedido,
  contactoDelPedidoQueryKey,
  misPedidosQueryKey,
  obtenerContactoDelPedido,
  obtenerPedido,
  pedidoQueryKey,
} from "../api";
import { ETIQUETAS_DESENLACE } from "../etiquetas";
import { nombreCompleto } from "../../postulaciones/lib/formato";
import { SelectorEstrellas } from "../components/SelectorEstrellas";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";

// docs/dominio.md §8: los 3 atributos fijos del documento, como strings libres
// en minuscula (el backend no valida contra una lista cerrada).
const ATRIBUTOS_RESENIA = [
  { valor: "puntual", etiqueta: "Puntual" },
  { valor: "prolijo", etiqueta: "Prolijo" },
  { valor: "claro con el precio", etiqueta: "Claro con el precio" },
] as const;

type CamposResenia = Pick<ReseniaAlCerrar, "comentario" | "montoDeclarado">;
const CAMPOS_RESENIA_SCHEMA = reseniaAlCerrarSchema.pick({
  comentario: true,
  montoDeclarado: true,
});

const normalizarTexto = (valor: string): string | undefined =>
  valor.trim() === "" ? undefined : valor.trim();
const normalizarMonto = (valor: string): number | undefined =>
  valor.trim() === "" ? undefined : Number(valor);

function textoErrorCerrar(error: unknown): string {
  if (error instanceof ErrorApiHttp) {
    if (error.codigo === "conflicto") {
      return "No pudimos cerrar el pedido: puede que ya esté cerrado o que ya hayas usado la postergación antes. Volvé a cargar la página para ver el estado actual.";
    }
    return error.mensaje;
  }
  return "No pudimos cerrar el pedido. Probá de nuevo.";
}

/** CL-11 · Cerrar y reseñar. Requiere sesion (el pedido siempre pertenece al cliente). */
export function CerrarPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const pedidoId = id ?? "";
  const { usuario } = useSesion();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [desenlace, setDesenlace] = useState<Desenlace | null>(null);
  const [contactoId, setContactoId] = useState<string | null>(null);
  const [puntaje, setPuntaje] = useState<number | null>(null);
  const [atributosSeleccionados, setAtributosSeleccionados] = useState<string[]>([]);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorPuntaje, setErrorPuntaje] = useState<string | null>(null);

  const pedidoQuery = useQuery({
    queryKey: pedidoQueryKey(pedidoId),
    queryFn: () => obtenerPedido(pedidoId),
    enabled: Boolean(usuario) && Boolean(pedidoId),
  });

  const contactosQuery = useQuery({
    queryKey: contactoDelPedidoQueryKey(pedidoId),
    queryFn: () => obtenerContactoDelPedido(pedidoId),
    enabled:
      Boolean(usuario) && Boolean(pedidoId) && pedidoQuery.data?.estado === "contacto_habilitado",
  });

  const form = useForm<CamposResenia>({
    resolver: zodResolver(CAMPOS_RESENIA_SCHEMA),
    defaultValues: { comentario: undefined, montoDeclarado: undefined },
  });

  const mutacionCerrar = useMutation({
    mutationFn: (datos: CerrarPedido) => cerrarPedido(pedidoId, datos),
    onSuccess: (pedidoActualizado) => {
      queryClient.setQueryData(pedidoQueryKey(pedidoId), pedidoActualizado);
      // Un pedido cerrado deja de ser "activo": CL-01 lo tiene que ver actualizado.
      void queryClient.invalidateQueries({ queryKey: misPedidosQueryKey });
      if (pedidoActualizado.estado === "cerrado") {
        navigate(`/pedidos/${pedidoId}`);
      }
    },
    onError: (error) => setErrorEnvio(textoErrorCerrar(error)),
  });

  if (!usuario) {
    return <Navigate to="/ingresar" replace />;
  }
  if (!pedidoId) {
    return <Navigate to="/" replace />;
  }

  function enviarCierre(incluirResenia: boolean, camposResenia: CamposResenia) {
    setErrorEnvio(null);
    if (!desenlace) {
      setErrorEnvio("Elegí qué pasó con este pedido.");
      return;
    }

    const candidato: CerrarPedido = {
      desenlace,
      ...(desenlace === "lo_hizo_este_profesional" && contactoId ? { contactoId } : {}),
      ...(desenlace === "lo_hizo_este_profesional" && incluirResenia
        ? {
            resenia: {
              puntaje: puntaje ?? 0,
              atributos: atributosSeleccionados,
              comentario: camposResenia.comentario,
              montoDeclarado: camposResenia.montoDeclarado,
            },
          }
        : {}),
    };

    const resultado = cerrarPedidoSchema.safeParse(candidato);
    if (!resultado.success) {
      setErrorEnvio(resultado.error.issues[0]?.message ?? "Revisá los datos antes de continuar.");
      return;
    }
    mutacionCerrar.mutate(resultado.data);
  }

  // "Cerrar sin reseñar" y los desenlaces sin reseña no dependen de los
  // campos de react-hook-form: se cierran directo, sin pasar por handleSubmit.
  function confirmarSinResenia() {
    enviarCierre(false, { comentario: undefined, montoDeclarado: undefined });
  }

  // Validamos el puntaje a mano (es estado local, no pasa por
  // react-hook-form) *antes* de armar el payload, para no dejar pasar el
  // mensaje crudo de Zod hasta el safeParse general. comentario/montoDeclarado
  // ya llegan validados por el zodResolver del formulario (ver `form.handleSubmit`
  // en el botón "Publicar reseña y cerrar").
  function confirmarConResenia(camposResenia: CamposResenia) {
    setErrorEnvio(null);
    if (!puntaje) {
      setErrorPuntaje("Elegí un puntaje de 1 a 5 estrellas antes de publicar la reseña.");
      return;
    }
    setErrorPuntaje(null);
    enviarCierre(true, camposResenia);
  }

  const pedido = pedidoQuery.data;
  const contactos = contactosQuery.data;
  // Se posterga sin navegar: el pedido sigue en contacto_habilitado, solo cambia desenlacePostergado.
  const acabaDePostergar =
    mutacionCerrar.isSuccess &&
    mutacionCerrar.data.estado === "contacto_habilitado" &&
    mutacionCerrar.data.desenlacePostergado;

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <header className="flex items-center gap-2">
        <Link
          to={`/pedidos/${pedidoId}`}
          aria-label="Volver al pedido"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="text-xl font-bold text-teal-800">Cerrar y reseñar</h1>
      </header>

      {pedidoQuery.isPending && <Spinner etiqueta="Cargando tu pedido" />}

      {pedidoQuery.isError && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p role="alert">
            {pedidoQuery.error instanceof ErrorApiHttp &&
            pedidoQuery.error.codigo === "no_encontrado"
              ? "Este pedido no existe o no es tuyo."
              : "No pudimos cargar tu pedido."}
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              className="min-h-11 font-semibold underline"
              onClick={() => pedidoQuery.refetch()}
            >
              Reintentar
            </button>
            <Link
              to={`/pedidos/${pedidoId}`}
              className="flex min-h-11 items-center font-semibold underline"
            >
              Volver al pedido
            </Link>
          </div>
        </div>
      )}

      {pedido && pedido.estado === "cerrado" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center">
          <p className="text-slate-700">Este pedido ya está cerrado.</p>
          <Link
            to={`/pedidos/${pedidoId}`}
            className="min-h-11 font-semibold text-teal-800 underline"
          >
            Volver al pedido
          </Link>
        </div>
      )}

      {pedido && pedido.estado !== "cerrado" && pedido.estado !== "contacto_habilitado" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center">
          <p className="text-slate-700">
            Este pedido todavía no tiene contacto habilitado, así que no se puede cerrar desde acá.
          </p>
          <Link
            to={`/pedidos/${pedidoId}`}
            className="min-h-11 font-semibold text-teal-800 underline"
          >
            Volver al pedido
          </Link>
        </div>
      )}

      {pedido && pedido.estado === "contacto_habilitado" && (
        <>
          {acabaDePostergar ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900"
            >
              <p className="font-semibold">Listo, te volvemos a preguntar en una semana.</p>
              <p>Si para entonces no nos contás qué pasó, vamos a cerrar el pedido sin reseña.</p>
              <Link to={`/pedidos/${pedidoId}`} className="font-semibold underline">
                Volver al pedido
              </Link>
            </div>
          ) : (
            <>
              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium text-slate-700">
                  ¿Qué pasó con este pedido?
                </legend>
                <div className="flex flex-col gap-2">
                  {DESENLACES.map((opcion) => {
                    const deshabilitado =
                      opcion === "todavia_no_lo_resolvi" && pedido.desenlacePostergado;
                    return (
                      <label
                        key={opcion}
                        className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 text-sm font-medium ${
                          deshabilitado
                            ? "cursor-not-allowed border-slate-200 text-slate-400"
                            : "cursor-pointer border-slate-300 text-slate-700 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800"
                        }`}
                      >
                        <input
                          type="radio"
                          name="desenlace"
                          value={opcion}
                          checked={desenlace === opcion}
                          disabled={deshabilitado}
                          onChange={() => {
                            setDesenlace(opcion);
                            setErrorEnvio(null);
                          }}
                          className="h-5 w-5"
                        />
                        {ETIQUETAS_DESENLACE[opcion]}
                      </label>
                    );
                  })}
                </div>
                {pedido.desenlacePostergado && (
                  <p className="text-xs text-slate-500">
                    Ya postergaste el desenlace de este pedido una vez: «todavía no lo resolví» ya
                    no está disponible.
                  </p>
                )}
              </fieldset>

              {desenlace === "todavia_no_lo_resolvi" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Te volvemos a preguntar en una semana. Si para entonces no respondés, cerramos el
                  pedido sin reseña. Solo podés postergarlo una vez.
                </div>
              )}

              {desenlace === "lo_hizo_este_profesional" && (
                <fieldset className="flex flex-col gap-3">
                  <legend className="text-sm font-medium text-slate-700">
                    ¿Cuál de los elegidos hizo el trabajo?
                  </legend>

                  {contactosQuery.isPending && <Spinner etiqueta="Cargando tus elegidos" />}
                  {contactosQuery.isError && (
                    <p role="alert" className="text-sm text-red-600">
                      No pudimos cargar los profesionales que elegiste.
                    </p>
                  )}
                  {contactos && contactos.length === 0 && (
                    <p className="text-sm text-slate-500">
                      Todavía no elegiste a ningún profesional para este pedido.
                    </p>
                  )}
                  {contactos && contactos.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {contactos.map((contacto) => (
                        <label
                          key={contacto.id}
                          className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800"
                        >
                          <input
                            type="radio"
                            name="contacto"
                            value={contacto.id}
                            checked={contactoId === contacto.id}
                            onChange={() => {
                              setContactoId(contacto.id);
                              setErrorEnvio(null);
                            }}
                            className="h-5 w-5"
                          />
                          {nombreCompleto(contacto.profesional, "Profesional")}
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}

              {desenlace === "lo_hizo_este_profesional" && (
                <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4">
                  <h2 className="font-semibold text-slate-900">Reseña (opcional)</h2>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-slate-700">Puntaje</span>
                    <SelectorEstrellas
                      valor={puntaje}
                      onChange={(valor) => {
                        setPuntaje(valor);
                        setErrorPuntaje(null);
                      }}
                    />
                    {errorPuntaje && (
                      <p role="alert" className="text-sm text-red-600">
                        {errorPuntaje}
                      </p>
                    )}
                  </div>

                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium text-slate-700">
                      ¿Cómo lo describirías?
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {ATRIBUTOS_RESENIA.map((atributo) => {
                        const marcado = atributosSeleccionados.includes(atributo.valor);
                        return (
                          <label
                            key={atributo.valor}
                            className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${
                              marcado
                                ? "border-teal-700 bg-teal-50 text-teal-800"
                                : "border-slate-300 text-slate-700"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() =>
                                setAtributosSeleccionados((actual) =>
                                  marcado
                                    ? actual.filter((valor) => valor !== atributo.valor)
                                    : [...actual, atributo.valor],
                                )
                              }
                              className="h-4 w-4"
                            />
                            {atributo.etiqueta}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="comentario" className="text-sm font-medium text-slate-700">
                      Comentario (opcional)
                    </label>
                    <textarea
                      id="comentario"
                      rows={4}
                      placeholder="Contá cómo te fue con el trabajo..."
                      className="rounded-lg border border-slate-300 p-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                      aria-invalid={Boolean(form.formState.errors.comentario)}
                      aria-describedby={
                        form.formState.errors.comentario ? "comentario-error" : undefined
                      }
                      {...form.register("comentario", { setValueAs: normalizarTexto })}
                    />
                    {form.formState.errors.comentario && (
                      <p id="comentario-error" role="alert" className="text-sm text-red-600">
                        {form.formState.errors.comentario.message}
                      </p>
                    )}
                  </div>

                  <Field
                    label="Monto final (opcional, privado: solo nosotros lo vemos)"
                    inputMode="numeric"
                    type="number"
                    min={0}
                    step={1}
                    error={form.formState.errors.montoDeclarado?.message}
                    {...form.register("montoDeclarado", { setValueAs: normalizarMonto })}
                  />
                </section>
              )}

              {errorEnvio && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {errorEnvio}
                </p>
              )}

              {desenlace &&
                (desenlace === "lo_hizo_este_profesional" ? (
                  <div className="flex flex-col gap-3">
                    <Button
                      type="button"
                      cargando={mutacionCerrar.isPending}
                      onClick={form.handleSubmit(confirmarConResenia)}
                    >
                      Publicar reseña y cerrar
                    </Button>
                    <Button
                      type="button"
                      variante="secundario"
                      cargando={mutacionCerrar.isPending}
                      onClick={confirmarSinResenia}
                    >
                      Cerrar sin reseñar
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    cargando={mutacionCerrar.isPending}
                    onClick={confirmarSinResenia}
                  >
                    {desenlace === "todavia_no_lo_resolvi" ? "Confirmar" : "Cerrar pedido"}
                  </Button>
                ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
