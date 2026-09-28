import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  crearDenunciaSchema,
  MOTIVOS_DENUNCIA_RESENIA as MOTIVOS_DENUNCIA_RESENIA_COMPARTIDOS,
  type CrearDenuncia,
  type TipoObjetoDenuncia,
} from "@fixeo/shared";
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

// CL-09: "denunciar" un perfil de profesional.
const MOTIVOS_DENUNCIA_PERFIL = [
  "Perfil falso o suplantación de identidad",
  "Contenido inapropiado en el perfil",
  "Comportamiento abusivo o irrespetuoso",
  "Spam o publicidad",
  "Otro motivo",
] as const;

// CL-08: "denunciar" una postulacion recibida.
const MOTIVOS_DENUNCIA_POSTULACION = [
  "Mensaje con contenido inapropiado",
  "Perfil sospechoso o falso",
  "Spam o publicidad",
  "Otro motivo",
] as const;

// Cada opcion es { value, label }: el `value` que se manda es texto libre
// (motivo tipificado en pantalla, no un enum compartido), salvo "resenia" mas
// abajo, que si necesita mandar la `clave` exacta (no la etiqueta) porque el
// backend la compara contra MOTIVOS_DENUNCIA_RESENIA_QUE_OCULTAN.
interface OpcionMotivo {
  value: string;
  label: string;
}

function comoOpciones(motivos: readonly string[]): OpcionMotivo[] {
  return motivos.map((motivo) => ({ value: motivo, label: motivo }));
}

// CL-09: "denunciar" una reseña publicada. A diferencia de los demas tipos,
// la lista es la del contrato (packages/shared), no texto libre local: el
// backend reacciona programaticamente a la clave para decidir si oculta la
// reseña mientras se revisa (docs/dominio.md §8).
const MOTIVOS_DENUNCIA_RESENIA: OpcionMotivo[] = MOTIVOS_DENUNCIA_RESENIA_COMPARTIDOS.map(
  (motivo) => ({ value: motivo.clave, label: motivo.etiqueta }),
);

const TITULOS_POR_TIPO: Record<TipoObjetoDenuncia, string> = {
  pedido: "Denunciar este pedido",
  perfil: "Denunciar este perfil",
  postulacion: "Denunciar esta postulación",
  resenia: "Denunciar esta reseña",
};

const MOTIVOS_POR_TIPO: Record<TipoObjetoDenuncia, OpcionMotivo[]> = {
  pedido: comoOpciones(MOTIVOS_DENUNCIA_PEDIDO),
  perfil: comoOpciones(MOTIVOS_DENUNCIA_PERFIL),
  postulacion: comoOpciones(MOTIVOS_DENUNCIA_POSTULACION),
  resenia: MOTIVOS_DENUNCIA_RESENIA,
};

const normalizarDetalle = (valor: string): string | undefined => (valor === "" ? undefined : valor);

interface FormularioDenunciaProps {
  tipoObjeto: TipoObjetoDenuncia;
  objetoId: string;
  onExito: () => void;
  onCancelar: () => void;
}

/**
 * CO-07 "denunciar" (docs/dominio.md §15: "Canal de denuncia en perfil,
 * pedido, postulacion y resenia"). Titulo y motivos varian segun
 * `tipoObjeto`: los cuatro tipos del contrato ya tienen una pantalla que
 * dispara esta denuncia (pedido/perfil desde antes, postulacion en CL-08 y
 * resenia en CL-09).
 */
export function FormularioDenuncia({
  tipoObjeto,
  objetoId,
  onExito,
  onCancelar,
}: FormularioDenunciaProps) {
  const titulo = TITULOS_POR_TIPO[tipoObjeto];
  const motivos = MOTIVOS_POR_TIPO[tipoObjeto];

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
      <h2 className="font-semibold text-slate-900">{titulo}</h2>

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
          {motivos.map((motivo) => (
            <option key={motivo.value} value={motivo.value}>
              {motivo.label}
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
