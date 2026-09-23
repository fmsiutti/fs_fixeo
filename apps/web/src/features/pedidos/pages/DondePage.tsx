import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { direccionSchema, TIPOS_PROPIEDAD, type DireccionInput } from "@fixeo/shared";
import { barriosQueryKey, obtenerBarrios, registrarEvento } from "../api";
import { useBorradorPedido } from "../borrador";
import { AsistenteHeader } from "../components/AsistenteHeader";
import { ETIQUETAS_TIPO_PROPIEDAD, LAT_FALLBACK_AMBA, LNG_FALLBACK_AMBA } from "../etiquetas";
import { Button } from "../../../components/ui/Button";
import { Field } from "../../../components/ui/Field";

type EstadoUbicacion = "inicial" | "buscando" | "lista" | "error";

// El input manda "" al dejar piso/depto vacios; direccionSchema los pide
// `min(1).optional()` (valido para omitirlos, no para mandar un string vacio).
// `setValueAs` normaliza el valor antes de que el resolver lo valide, sin
// tocar el schema compartido.
const normalizarOpcional = (valor: string): string | undefined =>
  valor === "" ? undefined : valor;

/** CL-04 · Publicar 3: donde. Sin geocoding: sin permiso de ubicacion, se publica igual con un fallback. */
export function DondePage() {
  const navigate = useNavigate();
  const { borrador, actualizar } = useBorradorPedido();
  const [estadoUbicacion, setEstadoUbicacion] = useState<EstadoUbicacion>("inicial");

  const barriosQuery = useQuery({
    queryKey: barriosQueryKey,
    queryFn: obtenerBarrios,
    staleTime: Infinity,
  });

  const form = useForm<DireccionInput>({
    resolver: zodResolver(direccionSchema),
    defaultValues: borrador.direccion ?? {
      calle: "",
      numero: "",
      piso: "",
      depto: "",
      tipoPropiedad: "casa",
      barrioId: "",
      lat: LAT_FALLBACK_AMBA,
      lng: LNG_FALLBACK_AMBA,
    },
  });

  if (!borrador.categoriaId) {
    return <Navigate to="/publicar/que" replace />;
  }

  function usarUbicacion() {
    if (!("geolocation" in navigator)) {
      setEstadoUbicacion("error");
      return;
    }
    setEstadoUbicacion("buscando");
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        form.setValue("lat", posicion.coords.latitude);
        form.setValue("lng", posicion.coords.longitude);
        setEstadoUbicacion("lista");
      },
      () => setEstadoUbicacion("error"),
      { timeout: 10_000 },
    );
  }

  function guardarYContinuar(datos: DireccionInput) {
    actualizar({ direccion: datos });
    registrarEvento({
      tipo: "asistente_paso_completado",
      categoriaId: borrador.categoriaId ?? undefined,
      barrioId: datos.barrioId,
      paso: "donde",
    }).catch(() => undefined);
    navigate("/publicar/cuando");
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <AsistenteHeader paso={3} titulo="¿Dónde es?" volverA="/publicar/problema" />

      <form
        noValidate
        onSubmit={form.handleSubmit(guardarYContinuar)}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={usarUbicacion}
            disabled={estadoUbicacion === "buscando"}
            className="min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-60"
          >
            {estadoUbicacion === "buscando" ? "Buscando tu ubicación…" : "Usar mi ubicación"}
          </button>
          {estadoUbicacion === "lista" && (
            <p className="text-sm text-teal-700">Usamos tu ubicación actual.</p>
          )}
          {estadoUbicacion === "error" && (
            <p className="text-sm text-slate-500">
              No pudimos acceder a tu ubicación. Elegí tu barrio en la lista de abajo.
            </p>
          )}
        </div>

        <Field
          label="Calle"
          error={form.formState.errors.calle?.message}
          {...form.register("calle")}
        />
        <Field
          label="Altura"
          inputMode="numeric"
          error={form.formState.errors.numero?.message}
          {...form.register("numero")}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Piso (opcional)"
            error={form.formState.errors.piso?.message}
            {...form.register("piso", { setValueAs: normalizarOpcional })}
          />
          <Field
            label="Depto (opcional)"
            error={form.formState.errors.depto?.message}
            {...form.register("depto", { setValueAs: normalizarOpcional })}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700">Tipo de propiedad</legend>
          <div className="flex gap-3">
            {TIPOS_PROPIEDAD.map((tipo) => (
              <label
                key={tipo}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-2 text-sm font-medium text-slate-700 has-[:checked]:border-teal-700 has-[:checked]:bg-teal-50 has-[:checked]:text-teal-800"
              >
                <input
                  type="radio"
                  value={tipo}
                  className="sr-only"
                  {...form.register("tipoPropiedad")}
                />
                {ETIQUETAS_TIPO_PROPIEDAD[tipo]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="barrioId" className="text-sm font-medium text-slate-700">
            Barrio
          </label>

          {barriosQuery.isPending && <p className="text-sm text-slate-500">Cargando barrios…</p>}

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

          {barriosQuery.data && (
            <select
              id="barrioId"
              className="min-h-11 rounded-lg border border-slate-300 px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              {...form.register("barrioId")}
            >
              <option value="">Elegí un barrio</option>
              {barriosQuery.data.map((barrio) => (
                <option key={barrio.id} value={barrio.id}>
                  {barrio.nombre}
                </option>
              ))}
            </select>
          )}
          {form.formState.errors.barrioId && (
            <p role="alert" className="text-sm text-red-600">
              Elegí un barrio de la lista
            </p>
          )}
        </div>

        <Button type="submit" disabled={!barriosQuery.data}>
          Continuar
        </Button>
      </form>
    </main>
  );
}
