import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { responderReseniaSchema, type ReseniaVista, type ResponderResenia } from "@fixeo/shared";
import { misReseniasQueryKey, responderResenia } from "../api";
import { FormularioDenuncia } from "../../feed/components/FormularioDenuncia";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp } from "../../../lib/http";

function nombreClienteResenia(resenia: ReseniaVista): string {
  const nombre = resenia.cliente.nombre ?? "Cliente de Fixeo";
  return resenia.cliente.inicialApellido ? `${nombre} ${resenia.cliente.inicialApellido}` : nombre;
}

interface TarjetaReseniaProps {
  resenia: ReseniaVista;
  /** PR-07: solo el dueño del perfil puede responder, y solo una vez (docs/dominio.md §8). */
  puedeResponder?: boolean;
}

/** CL-09/PR-07: una reseña publicada, con su respuesta (si existe) y, en PR-07, el formulario para responderla. */
export function TarjetaResenia({ resenia, puedeResponder = false }: TarjetaReseniaProps) {
  const queryClient = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mostrarDenuncia, setMostrarDenuncia] = useState(false);
  const [denunciaEnviada, setDenunciaEnviada] = useState(false);

  const form = useForm<ResponderResenia>({
    resolver: zodResolver(responderReseniaSchema),
    defaultValues: { respuesta: "" },
  });

  const mutacion = useMutation({
    mutationFn: (datos: ResponderResenia) => responderResenia(resenia.id, datos),
    onSuccess: () => {
      setMostrarFormulario(false);
      void queryClient.invalidateQueries({ queryKey: misReseniasQueryKey });
    },
  });

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{nombreClienteResenia(resenia)}</span>
        <span aria-hidden="true" className="text-amber-500">
          {"★".repeat(resenia.puntaje)}
          {"☆".repeat(5 - resenia.puntaje)}
        </span>
        <span className="sr-only">{resenia.puntaje} de 5 estrellas</span>
      </div>

      <p className="text-xs text-slate-500">
        {resenia.categoria.nombre} · {new Date(resenia.publicadaEn).toLocaleDateString("es-AR")}
      </p>

      {resenia.atributos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {resenia.atributos.map((atributo) => (
            <span
              key={atributo}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700"
            >
              {atributo}
            </span>
          ))}
        </div>
      )}

      {resenia.comentario && <p className="text-sm text-slate-700">{resenia.comentario}</p>}

      {resenia.respuestaProfesional && (
        <div className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
          <p className="font-semibold">Respuesta del profesional</p>
          <p>{resenia.respuestaProfesional}</p>
        </div>
      )}

      {puedeResponder && !resenia.respuestaProfesional && (
        <div className="flex flex-col gap-2">
          {!mostrarFormulario ? (
            <Button type="button" variante="secundario" onClick={() => setMostrarFormulario(true)}>
              Responder
            </Button>
          ) : (
            <form
              noValidate
              onSubmit={form.handleSubmit((datos) => mutacion.mutate(datos))}
              className="flex flex-col gap-2"
            >
              <label
                htmlFor={`respuesta-${resenia.id}`}
                className="text-sm font-medium text-slate-700"
              >
                Tu respuesta (pública, una sola vez)
              </label>
              <textarea
                id={`respuesta-${resenia.id}`}
                rows={3}
                className="rounded-lg border border-slate-300 p-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                aria-invalid={Boolean(form.formState.errors.respuesta)}
                aria-describedby={
                  form.formState.errors.respuesta ? `respuesta-${resenia.id}-error` : undefined
                }
                {...form.register("respuesta")}
              />
              {form.formState.errors.respuesta && (
                <p
                  id={`respuesta-${resenia.id}-error`}
                  role="alert"
                  className="text-sm text-red-600"
                >
                  {form.formState.errors.respuesta.message}
                </p>
              )}
              {mutacion.isError && (
                <p role="alert" className="text-sm text-red-600">
                  {mutacion.error instanceof ErrorApiHttp
                    ? mutacion.error.mensaje
                    : "No pudimos publicar tu respuesta. Probá de nuevo."}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() => setMostrarFormulario(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" cargando={mutacion.isPending}>
                  Publicar respuesta
                </Button>
              </div>
            </form>
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
          tipoObjeto="resenia"
          objetoId={resenia.id}
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
