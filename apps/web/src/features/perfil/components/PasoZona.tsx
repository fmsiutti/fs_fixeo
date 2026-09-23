import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  zonaCoberturaSchema,
  type PerfilProfesionalVistaPropia,
  type ZonaCoberturaInput,
} from "@fixeo/shared";
import { barriosQueryKey, obtenerBarrios } from "../../pedidos/api";
import { guardarZona } from "../api";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";
import { Spinner } from "../../../components/ui/Spinner";
import { ErrorApiHttp } from "../../../lib/http";

type TipoZona = "barrios" | "radio";

interface PasoZonaProps {
  perfil: PerfilProfesionalVistaPropia;
  onExito: (perfil: PerfilProfesionalVistaPropia) => void;
}

/**
 * PR-01 · paso "Zona". Sin mapa interactivo en este slice (eso es propio de
 * CL-04): radio buttons para el tipo, checkboxes de barrios activos o inputs
 * numericos manuales de lat/lng/radioKm.
 */
export function PasoZona({ perfil, onExito }: PasoZonaProps) {
  const zonaActual = perfil.zonaCobertura;
  const [tipo, setTipo] = useState<TipoZona>(zonaActual?.tipo ?? "barrios");
  const [barrioIds, setBarrioIds] = useState<Set<string>>(
    () => new Set(zonaActual?.tipo === "barrios" ? zonaActual.barrioIds : []),
  );
  const [centroLat, setCentroLat] = useState(
    zonaActual?.tipo === "radio" ? String(zonaActual.centroLat) : "",
  );
  const [centroLng, setCentroLng] = useState(
    zonaActual?.tipo === "radio" ? String(zonaActual.centroLng) : "",
  );
  const [radioKm, setRadioKm] = useState(
    zonaActual?.tipo === "radio" ? String(zonaActual.radioKm) : "",
  );
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const barriosQuery = useQuery({
    queryKey: barriosQueryKey,
    queryFn: obtenerBarrios,
    staleTime: Infinity,
  });

  const mutacion = useMutation({
    mutationFn: guardarZona,
    onSuccess: onExito,
  });

  function toggleBarrio(id: string) {
    setBarrioIds((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) {
        nuevo.delete(id);
      } else {
        nuevo.add(id);
      }
      return nuevo;
    });
  }

  function enviar() {
    const candidato: ZonaCoberturaInput =
      tipo === "barrios"
        ? { tipo: "barrios", barrioIds: Array.from(barrioIds) }
        : {
            tipo: "radio",
            centroLat: Number(centroLat),
            centroLng: Number(centroLng),
            radioKm: Number(radioKm),
          };

    const resultado = zonaCoberturaSchema.safeParse(candidato);
    if (!resultado.success) {
      setErrorValidacion(resultado.error.issues[0]?.message ?? "Revisá los datos de tu zona");
      return;
    }
    setErrorValidacion(null);
    mutacion.mutate(resultado.data);
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">
          ¿Cómo querés definir tu zona?
        </legend>
        <div className="flex gap-3">
          {(["barrios", "radio"] as const).map((opcion) => (
            <label
              key={opcion}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-2 text-sm font-medium text-slate-700 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800"
            >
              <input
                type="radio"
                name="tipo-zona"
                value={opcion}
                checked={tipo === opcion}
                onChange={() => setTipo(opcion)}
                className="sr-only"
              />
              {opcion === "barrios" ? "Por barrios" : "Por radio desde un punto"}
            </label>
          ))}
        </div>
      </fieldset>

      {tipo === "barrios" && (
        <div className="flex flex-col gap-2">
          {barriosQuery.isPending && <Spinner etiqueta="Cargando barrios" />}

          {barriosQuery.isError && (
            <p className="text-sm text-red-600" role="alert">
              No pudimos cargar los barrios.{" "}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => barriosQuery.refetch()}
              >
                Reintentar
              </button>
            </p>
          )}

          {barriosQuery.data && barriosQuery.data.length === 0 && (
            <p className="text-sm text-slate-500">Todavía no hay barrios activos cargados.</p>
          )}

          {barriosQuery.data && barriosQuery.data.length > 0 && (
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label="Barrios donde trabajás"
            >
              {barriosQuery.data.map((barrio) => (
                <label
                  key={barrio.id}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-2 text-sm text-slate-700 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50"
                >
                  <input
                    type="checkbox"
                    checked={barrioIds.has(barrio.id)}
                    onChange={() => toggleBarrio(barrio.id)}
                  />
                  {barrio.nombre}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {tipo === "radio" && (
        <div className="flex flex-col gap-4">
          <Field
            label="Latitud del centro"
            inputMode="decimal"
            value={centroLat}
            onChange={(evento) => setCentroLat(evento.target.value)}
          />
          <Field
            label="Longitud del centro"
            inputMode="decimal"
            value={centroLng}
            onChange={(evento) => setCentroLng(evento.target.value)}
          />
          <Field
            label="Radio en kilómetros"
            inputMode="decimal"
            value={radioKm}
            onChange={(evento) => setRadioKm(evento.target.value)}
          />
        </div>
      )}

      {errorValidacion && (
        <p role="alert" className="text-sm text-red-600">
          {errorValidacion}
        </p>
      )}

      {mutacion.isError && (
        <p role="alert" className="text-sm text-red-600">
          {mutacion.error instanceof ErrorApiHttp
            ? mutacion.error.mensaje
            : "No pudimos guardar tu zona. Probá de nuevo."}
        </p>
      )}

      <Button type="button" onClick={enviar} cargando={mutacion.isPending}>
        Continuar
      </Button>
    </div>
  );
}
