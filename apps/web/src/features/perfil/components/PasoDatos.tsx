import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  armarPerfilSchema,
  type ArmarPerfil,
  type PerfilProfesionalVistaPropia,
} from "@fixeo/shared";
import { armarPerfil } from "../api";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { ErrorApiHttp } from "../../../lib/http";

interface PasoDatosProps {
  perfil: PerfilProfesionalVistaPropia | undefined;
  onExito: (perfil: PerfilProfesionalVistaPropia) => void;
}

const normalizarAnios = (valor: string): number | undefined =>
  valor === "" ? undefined : Number(valor);

// El textarea manda "" al dejarlo vacio; armarPerfilSchema pide
// `min(1).optional()` (valido para omitirlo, no para mandar un string vacio).
// Mismo patron que DondePage con piso/depto.
const normalizarPresentacion = (valor: string): string | undefined =>
  valor === "" ? undefined : valor;

/** PR-01 · paso "Datos basicos". Upsert lazy: aunque quede vacio, crea el perfil (PATCH /perfil-profesional). */
export function PasoDatos({ perfil, onExito }: PasoDatosProps) {
  const form = useForm<ArmarPerfil>({
    resolver: zodResolver(armarPerfilSchema),
    defaultValues: {
      presentacion: perfil?.presentacion ?? undefined,
      aniosExperiencia: perfil?.aniosExperiencia ?? undefined,
    },
  });

  const mutacion = useMutation({
    mutationFn: armarPerfil,
    onSuccess: onExito,
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((datos) => mutacion.mutate(datos))}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="presentacion" className="text-sm font-medium text-slate-700">
          Contanos sobre vos (opcional)
        </label>
        <textarea
          id="presentacion"
          rows={4}
          placeholder="Ej: Gasista matriculado, 10 años de experiencia en instalaciones residenciales."
          className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          {...form.register("presentacion", { setValueAs: normalizarPresentacion })}
        />
        {form.formState.errors.presentacion && (
          <p role="alert" className="text-sm text-red-600">
            {form.formState.errors.presentacion.message}
          </p>
        )}
      </div>

      <Field
        label="Años de experiencia (opcional)"
        type="number"
        inputMode="numeric"
        min={0}
        error={form.formState.errors.aniosExperiencia?.message}
        {...form.register("aniosExperiencia", { setValueAs: normalizarAnios })}
      />

      {mutacion.isError && (
        <p role="alert" className="text-sm text-red-600">
          {mutacion.error instanceof ErrorApiHttp
            ? mutacion.error.mensaje
            : "No pudimos guardar tus datos. Probá de nuevo."}
        </p>
      )}

      <Button type="submit" cargando={mutacion.isPending}>
        Continuar
      </Button>
    </form>
  );
}
