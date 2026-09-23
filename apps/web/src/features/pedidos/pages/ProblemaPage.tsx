import { useMemo } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DESCRIPCION_MAX, DESCRIPCION_MIN, detectarDatosDeContacto } from "@fixeo/shared";
import { categoriasQueryKey, obtenerCategorias, registrarEvento } from "../api";
import { useBorradorPedido } from "../borrador";
import { AsistenteHeader } from "../components/AsistenteHeader";
import { FotoUploader } from "../components/FotoUploader";
import { PreguntaGuia } from "../components/PreguntaGuia";
import { Button } from "../../../components/ui/Button";

/** CL-03 · Publicar 2: el problema. La validacion autoritativa de largo vive en el submit final (CL-06). */
export function ProblemaPage() {
  const navigate = useNavigate();
  const { borrador, actualizar } = useBorradorPedido();

  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKey,
    queryFn: obtenerCategorias,
    staleTime: Infinity,
  });

  const deteccion = useMemo(
    () => detectarDatosDeContacto(borrador.descripcion),
    [borrador.descripcion],
  );

  if (!borrador.categoriaId) {
    return <Navigate to="/publicar/que" replace />;
  }

  // El schema trimea antes de medir (packages/shared/src/pedidos.ts): contar
  // sin trim dejaria pasar un texto con espacios al borde que despues vuelve
  // 400 desde la api.
  const largo = borrador.descripcion.trim().length;
  const faltanCaracteres = Math.max(0, DESCRIPCION_MIN - largo);
  const descripcionValida = largo >= DESCRIPCION_MIN && largo <= DESCRIPCION_MAX;
  const categoriaActual = categoriasQuery.data?.find(
    (categoria) => categoria.id === borrador.categoriaId,
  );
  const preguntasGuia = categoriaActual?.preguntasGuia ?? [];

  function continuar() {
    registrarEvento({
      tipo: "asistente_paso_completado",
      categoriaId: borrador.categoriaId ?? undefined,
      paso: "problema",
    }).catch(() => undefined);
    navigate("/publicar/donde");
  }

  function responderPregunta(pregunta: string, respuesta: string) {
    const siguientes = { ...borrador.respuestasGuia };
    if (respuesta.trim()) {
      siguientes[pregunta] = respuesta;
    } else {
      delete siguientes[pregunta];
    }
    actualizar({ respuestasGuia: siguientes });
  }

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-white px-6 py-8">
      <AsistenteHeader paso={2} titulo="Contanos el problema" volverA="/publicar/que" />

      <div className="flex flex-col gap-2">
        <label htmlFor="descripcion" className="text-sm font-medium text-slate-700">
          Describí qué pasa, con el detalle que puedas
        </label>
        <textarea
          id="descripcion"
          rows={6}
          maxLength={DESCRIPCION_MAX}
          value={borrador.descripcion}
          onChange={(evento) => actualizar({ descripcion: evento.target.value })}
          placeholder="Ej: se rompió la canilla de la cocina y no para de gotear..."
          className="min-h-32 rounded-lg border border-slate-300 p-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {faltanCaracteres > 0
              ? `Te faltan al menos ${faltanCaracteres} caracteres`
              : "Longitud suficiente"}
          </span>
          <span>
            {largo}/{DESCRIPCION_MAX}
          </span>
        </div>

        {deteccion.detectado && (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Por tu seguridad, evitá compartir tu teléfono, email o redes acá. Se lo vas a poder dar
            directo a quien elijas más adelante.
          </p>
        )}
      </div>

      {preguntasGuia.length > 0 && (
        <div className="flex flex-col gap-4">
          {preguntasGuia.map((pregunta) => (
            <PreguntaGuia
              key={pregunta}
              pregunta={pregunta}
              respuesta={borrador.respuestasGuia[pregunta] ?? ""}
              onChange={(respuesta) => responderPregunta(pregunta, respuesta)}
            />
          ))}
        </div>
      )}

      <FotoUploader
        borradorId={borrador.borradorId}
        fotos={borrador.fotos}
        onChange={(fotos) => actualizar({ fotos })}
      />

      <Button type="button" disabled={!descripcionValida} onClick={continuar}>
        Continuar
      </Button>
    </main>
  );
}
