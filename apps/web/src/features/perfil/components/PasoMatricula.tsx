import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ExigenciaMatricula,
  OficioVista,
  SubirDocumentoVerificacion,
  VerificacionResumenVista,
} from "@fixeo/shared";
import type { TonoBadge } from "../../../components/ui/Badge";
import { perfilProfesionalQueryKey, subirDocumentoVerificacion } from "../api";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { ErrorApiHttp } from "../../../lib/http";
import { ETIQUETAS_ESTADO_MATRICULA, ETIQUETAS_EXIGENCIA_MATRICULA } from "../etiquetas";
import { verificacionMatriculaRechazada } from "../utils";

interface ValoresFormularioMatricula {
  matriculaNumero: string;
  matriculaEnte: string;
  matriculaVenceEn: string;
}

const TONOS_ESTADO_MATRICULA: Record<OficioVista["matriculaEstado"], TonoBadge> = {
  no_requerida: "neutro",
  pendiente: "advertencia",
  validada: "exito",
  rechazada: "error",
  vencida: "error",
};

interface FormularioMatriculaOficioProps {
  oficio: OficioVista;
  exigencia: Exclude<ExigenciaMatricula, "no_exigida">;
  motivoRechazo: string | null | undefined;
}

/** Sub-form por oficio: cada oficio que exige matricula tiene su propio numero, ente, vencimiento y documento. */
function FormularioMatriculaOficio({
  oficio,
  exigencia,
  motivoRechazo,
}: FormularioMatriculaOficioProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [claveInput, setClaveInput] = useState(0);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const form = useForm<ValoresFormularioMatricula>({
    defaultValues: {
      matriculaNumero: oficio.matriculaNumero ?? "",
      matriculaEnte: oficio.matriculaEnte ?? "",
      matriculaVenceEn: oficio.matriculaVenceEn ? oficio.matriculaVenceEn.slice(0, 10) : "",
    },
  });

  const mutacion = useMutation({
    mutationFn: (datos: SubirDocumentoVerificacion) =>
      subirDocumentoVerificacion({ archivo: archivo as File, datos }),
    onSuccess: () => {
      setArchivo(null);
      setClaveInput((actual) => actual + 1);
      // El back vuelve a poner el oficio en "pendiente" al recibir el
      // documento: sin invalidar, el badge y el motivo de rechazo quedan
      // desactualizados hasta el proximo fetch.
      void queryClient.invalidateQueries({ queryKey: perfilProfesionalQueryKey });
    },
  });

  function enviar(datos: ValoresFormularioMatricula) {
    if (!archivo) {
      setErrorArchivo("Elegí una foto o PDF de tu matrícula");
      return;
    }
    setErrorArchivo(null);
    mutacion.mutate({
      tipo: "matricula",
      oficioId: oficio.id,
      matriculaNumero: datos.matriculaNumero.trim(),
      matriculaEnte: datos.matriculaEnte.trim(),
      matriculaVenceEn: new Date(datos.matriculaVenceEn),
    });
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(enviar)}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{oficio.categoria.nombre}</span>
        <Badge tono={TONOS_ESTADO_MATRICULA[oficio.matriculaEstado]}>
          {ETIQUETAS_ESTADO_MATRICULA[oficio.matriculaEstado]}
        </Badge>
      </div>

      <Badge tono={exigencia === "obligatoria" ? "advertencia" : "neutro"}>
        {ETIQUETAS_EXIGENCIA_MATRICULA[exigencia]}
      </Badge>

      {exigencia === "obligatoria" ? (
        <p className="text-sm text-amber-900">
          Sin la matrícula validada no vas a poder postularte en {oficio.categoria.nombre}.
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          Subir tu matrícula es opcional para esta categoría, pero mejora tu perfil ante los
          clientes.
        </p>
      )}

      {oficio.matriculaEstado === "rechazada" && motivoRechazo && (
        <p role="alert" className="text-sm text-red-700">
          Te rechazamos la matrícula. Motivo: {motivoRechazo}
        </p>
      )}

      <Field
        label="Número de matrícula"
        error={form.formState.errors.matriculaNumero?.message}
        {...form.register("matriculaNumero", { required: "Ingresá el número de matrícula" })}
      />
      <Field
        label="Ente que la emitió"
        error={form.formState.errors.matriculaEnte?.message}
        {...form.register("matriculaEnte", { required: "Ingresá el ente que la emitió" })}
      />
      <Field
        label="Vencimiento"
        type="date"
        error={form.formState.errors.matriculaVenceEn?.message}
        {...form.register("matriculaVenceEn", { required: "Ingresá la fecha de vencimiento" })}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`matricula-doc-${oficio.id}`}
          className="text-sm font-medium text-slate-700"
        >
          Documento de la matrícula
        </label>
        <input
          key={claveInput}
          id={`matricula-doc-${oficio.id}`}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
          className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        {errorArchivo && (
          <p role="alert" className="text-sm text-red-600">
            {errorArchivo}
          </p>
        )}
      </div>

      {mutacion.isError && (
        <p role="alert" className="text-sm text-red-600">
          {mutacion.error instanceof ErrorApiHttp
            ? mutacion.error.mensaje
            : "No pudimos guardar la matrícula. Probá de nuevo."}
        </p>
      )}
      {mutacion.isSuccess && (
        <p role="status" className="text-sm text-teal-700">
          Guardamos los datos de tu matrícula.
        </p>
      )}

      <Button type="submit" variante="secundario" cargando={mutacion.isPending}>
        Guardar matrícula
      </Button>
    </form>
  );
}

export interface OficioConExigencia {
  oficio: OficioVista;
  exigencia: Exclude<ExigenciaMatricula, "no_exigida">;
}

interface PasoMatriculaProps {
  oficios: OficioConExigencia[];
  verificaciones: VerificacionResumenVista[];
  onContinuar: () => void;
}

/**
 * PR-01 · paso "Matrícula". Aparece si algun oficio elegido tiene matricula
 * obligatoria o recomendada (docs/pantallas.md PR-01, D9). El boton
 * "Terminar" nunca bloquea el avance, ni siquiera con matricula obligatoria
 * pendiente: esa exigencia se valida recien al postularse, no aca.
 */
export function PasoMatricula({ oficios, verificaciones, onContinuar }: PasoMatriculaProps) {
  const hayObligatoria = oficios.some((item) => item.exigencia === "obligatoria");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Cargá los datos y el documento de la matrícula de cada categoría.
      </p>
      {oficios.map(({ oficio, exigencia }) => (
        <FormularioMatriculaOficio
          key={oficio.id}
          oficio={oficio}
          exigencia={exigencia}
          motivoRechazo={verificacionMatriculaRechazada(verificaciones, oficio.id)?.motivoRechazo}
        />
      ))}
      {!hayObligatoria && (
        <p className="text-sm text-slate-500">
          Podés continuar sin cargar la matrícula ahora; te la vamos a pedir si más adelante querés
          destacarte en esta categoría.
        </p>
      )}
      <Button type="button" onClick={onContinuar}>
        Terminar
      </Button>
    </div>
  );
}
