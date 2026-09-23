import { useMemo } from "react";
import { detectarDatosDeContacto } from "@fixeo/shared";

interface PreguntaGuiaProps {
  pregunta: string;
  respuesta: string;
  onChange: (respuesta: string) => void;
}

/** CL-03 / editar pedido: una pregunta guia de la categoria, con el mismo aviso de datos de contacto que la descripcion. */
export function PreguntaGuia({ pregunta, respuesta, onChange }: PreguntaGuiaProps) {
  const id = `pregunta-guia-${pregunta}`;
  const deteccion = useMemo(() => detectarDatosDeContacto(respuesta), [respuesta]);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {pregunta}
      </label>
      <input
        id={id}
        type="text"
        value={respuesta}
        onChange={(evento) => onChange(evento.target.value)}
        className="min-h-11 rounded-lg border border-slate-300 p-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
      />
      {deteccion.detectado && (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Evitá compartir tu teléfono, email o redes acá.
        </p>
      )}
    </div>
  );
}
