import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FRANJAS, type Franja, type Urgencia } from "@fixeo/shared";
import { registrarEvento } from "../api";
import { useBorradorPedido } from "../borrador";
import { AsistenteHeader } from "../components/AsistenteHeader";
import { ETIQUETAS_FRANJA, ETIQUETAS_URGENCIA } from "../etiquetas";
import { Button } from "../../../components/ui/Button";

const URGENCIAS_ORDENADAS: Urgencia[] = ["emergencia", "esta_semana", "sin_apuro"];

/**
 * CL-05 · Publicar 4: cuando. Urgencia (radio) y franjas horarias (checkboxes,
 * al menos una): controles de seleccion simple, sin react-hook-form, igual
 * que el toggle de rol en CO-03/CO-06.
 */
export function CuandoPage() {
  const navigate = useNavigate();
  const { borrador, actualizar } = useBorradorPedido();
  const [urgencia, setUrgencia] = useState<Urgencia>(borrador.urgencia ?? "esta_semana");
  const [franjas, setFranjas] = useState<Franja[]>(borrador.franjas);
  const [errorFranjas, setErrorFranjas] = useState<string | null>(null);

  if (!borrador.categoriaId) {
    return <Navigate to="/publicar/que" replace />;
  }
  if (!borrador.direccion) {
    return <Navigate to="/publicar/donde" replace />;
  }

  function alternarFranja(franja: Franja) {
    setErrorFranjas(null);
    setFranjas((actual) =>
      actual.includes(franja) ? actual.filter((item) => item !== franja) : [...actual, franja],
    );
  }

  function continuar() {
    if (franjas.length === 0) {
      setErrorFranjas("Elegí al menos una franja horaria");
      return;
    }
    actualizar({ urgencia, franjas });
    registrarEvento({
      tipo: "asistente_paso_completado",
      categoriaId: borrador.categoriaId ?? undefined,
      barrioId: borrador.direccion?.barrioId,
      paso: "cuando",
    }).catch(() => undefined);
    navigate("/publicar/revisar");
  }

  return (
    <main id="contenido-principal" className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <AsistenteHeader paso={4} titulo="¿Cuándo te viene bien?" volverA="/publicar/donde" />

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
                checked={urgencia === opcion}
                onChange={() => setUrgencia(opcion)}
              />
              <span className="text-sm font-medium text-slate-800">
                {ETIQUETAS_URGENCIA[opcion]}
              </span>
            </label>
          ))}
        </div>
        {urgencia === "emergencia" && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Marcar emergencia puede implicar un recargo y avisa a más profesionales.
          </p>
        )}
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
                checked={franjas.includes(franja)}
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

      <Button type="button" onClick={continuar}>
        Continuar
      </Button>
    </main>
  );
}
