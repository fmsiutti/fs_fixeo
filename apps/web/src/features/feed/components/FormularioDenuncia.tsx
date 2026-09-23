import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { crearDenunciaSchema, type CrearDenuncia, type TipoObjetoDenuncia } from "@fixeo/shared";
import { crearDenuncia } from "../api";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp } from "../../../lib/http";

// CO-07: "Motivos tipificados + campo libre". No hay un enum compartido para
// esto (crearDenunciaSchema.motivo es texto libre de hasta 120 caracteres),
// asi que la lista vive aca; el texto elegido es lo que ve el moderador en AD-02.
const MOTIVOS_DENUNCIA_PEDIDO = [
  "Tiene datos de contacto en el texto",
  "Contenido inapropiado u ofensivo",
  "Pedido falso o duplicado",
  "Spam o publicidad",
  "Otro motivo",
] as const;

const normalizarDetalle = (valor: string): string | undefined => (valor === "" ? undefined : valor);

interface FormularioDenunciaProps {
  tipoObjeto: TipoObjetoDenuncia;
  objetoId: string;
  onExito: () => void;
  onCancelar: () => void;
}

/** PR-03 "denunciar" (unico origen habilitado en este slice, docs/dominio.md §12/§15). */
export function FormularioDenuncia({
  tipoObjeto,
  objetoId,
  onExito,
  onCancelar,
}: FormularioDenunciaProps) {
  const form = useForm<CrearDenuncia>({
    resolver: zodResolver(crearDenunciaSchema),
    defaultValues: { tipoObjeto, objetoId, motivo: "", detalle: undefined },
  });

  const mutacion = useMutation({
    mutationFn: crearDenuncia,
    onSuccess: onExito,
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((datos) => mutacion.mutate(datos))}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4"
    >
      <h2 className="font-semibold text-slate-900">Denunciar este pedido</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="denuncia-motivo" className="text-sm font-medium text-slate-700">
          Motivo
        </label>
        <select
          id="denuncia-motivo"
          className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          aria-invalid={Boolean(form.formState.errors.motivo)}
          aria-describedby={form.formState.errors.motivo ? "denuncia-motivo-error" : undefined}
          {...form.register("motivo")}
        >
          <option value="">Elegí un motivo</option>
          {MOTIVOS_DENUNCIA_PEDIDO.map((motivo) => (
            <option key={motivo} value={motivo}>
              {motivo}
            </option>
          ))}
        </select>
        {form.formState.errors.motivo && (
          <p id="denuncia-motivo-error" role="alert" className="text-sm text-red-600">
            {form.formState.errors.motivo.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="denuncia-detalle" className="text-sm font-medium text-slate-700">
          Contanos más (opcional)
        </label>
        <textarea
          id="denuncia-detalle"
          rows={3}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          {...form.register("detalle", { setValueAs: normalizarDetalle })}
        />
        {form.formState.errors.detalle && (
          <p role="alert" className="text-sm text-red-600">
            {form.formState.errors.detalle.message}
          </p>
        )}
      </div>

      {mutacion.isError && (
        <p role="alert" className="text-sm text-red-600">
          {mutacion.error instanceof ErrorApiHttp
            ? mutacion.error.mensaje
            : "No pudimos enviar la denuncia. Probá de nuevo."}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" variante="peligro" cargando={mutacion.isPending}>
          Denunciar
        </Button>
      </div>
    </form>
  );
}
