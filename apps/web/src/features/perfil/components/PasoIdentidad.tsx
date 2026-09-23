import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  EstadoVerificacion,
  PerfilProfesionalVistaPropia,
  VerificacionVista,
} from "@fixeo/shared";
import type { TonoBadge } from "../../../components/ui/Badge";
import { perfilProfesionalQueryKey, subirDocumentoVerificacion } from "../api";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { ErrorApiHttp } from "../../../lib/http";
import { ETIQUETAS_ESTADO_VERIFICACION } from "../etiquetas";
import { verificacionRechazadaMasReciente } from "../utils";

interface PasoIdentidadProps {
  perfil: PerfilProfesionalVistaPropia;
  onContinuar: () => void;
}

const TONOS_ESTADO_VERIFICACION: Record<EstadoVerificacion, TonoBadge> = {
  pendiente: "advertencia",
  aprobada: "exito",
  rechazada: "error",
};

/** PR-01 · paso "Identidad". Sin identidad no se puede postular (docs/pantallas.md PR-01). */
export function PasoIdentidad({ perfil, onContinuar }: PasoIdentidadProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [claveInput, setClaveInput] = useState(0);
  const [subidos, setSubidos] = useState<VerificacionVista[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const motivoRechazo = verificacionRechazadaMasReciente(perfil.verificaciones)?.motivoRechazo;

  const mutacion = useMutation({
    mutationFn: () =>
      subirDocumentoVerificacion({ archivo: archivo as File, datos: { tipo: "identidad" } }),
    onSuccess: (verificacion) => {
      setSubidos((actual) => [...actual, verificacion]);
      setArchivo(null);
      setClaveInput((actual) => actual + 1);
      setErrorArchivo(null);
      // El back vuelve a poner el estado en "pendiente" al recibir el
      // documento: sin invalidar, el badge y el motivo de rechazo quedan
      // desactualizados hasta el proximo fetch.
      void queryClient.invalidateQueries({ queryKey: perfilProfesionalQueryKey });
    },
  });

  function subir() {
    if (!archivo) {
      setErrorArchivo("Elegí una foto o PDF de tu documento");
      return;
    }
    mutacion.mutate();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Estado de tu identidad:</span>
        <Badge tono={TONOS_ESTADO_VERIFICACION[perfil.estadoVerificacion]}>
          {ETIQUETAS_ESTADO_VERIFICACION[perfil.estadoVerificacion]}
        </Badge>
      </div>

      <p className="text-sm text-slate-600">
        Necesitás verificar tu identidad para poder postularte a pedidos.
      </p>

      <p className="text-sm text-slate-600">
        Subí una foto legible del frente de tu DNI (o un PDF). Podés cargar el dorso aparte.
      </p>

      {perfil.estadoVerificacion === "rechazada" && motivoRechazo && (
        <p role="alert" className="text-sm text-red-700">
          Te rechazamos el documento. Motivo: {motivoRechazo}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="documento-identidad" className="text-sm font-medium text-slate-700">
          Documento de identidad
        </label>
        <input
          key={claveInput}
          id="documento-identidad"
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

      <Button type="button" variante="secundario" cargando={mutacion.isPending} onClick={subir}>
        Subir documento
      </Button>

      {mutacion.isError && (
        <p role="alert" className="text-sm text-red-600">
          {mutacion.error instanceof ErrorApiHttp
            ? mutacion.error.mensaje
            : "No pudimos subir el documento. Probá de nuevo."}
        </p>
      )}

      {subidos.length > 0 && (
        <p role="status" className="text-sm text-teal-700">
          Subiste {subidos.length} {subidos.length === 1 ? "documento" : "documentos"}.
        </p>
      )}

      <Button type="button" onClick={onContinuar}>
        Continuar
      </Button>
    </div>
  );
}
