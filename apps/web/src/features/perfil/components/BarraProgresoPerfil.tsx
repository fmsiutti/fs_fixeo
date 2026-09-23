interface PasoBarra {
  id: string;
  etiqueta: string;
}

interface BarraProgresoPerfilProps {
  pasos: PasoBarra[];
  pasoActualId: string;
  maxPasoIndex: number;
  onIrAPaso: (id: string) => void;
}

/** PR-01: barra de avance permanente. A diferencia de AsistenteHeader (CL-02 a CL-06), acá se puede saltar a cualquier paso ya alcanzado. */
export function BarraProgresoPerfil({
  pasos,
  pasoActualId,
  maxPasoIndex,
  onIrAPaso,
}: BarraProgresoPerfilProps) {
  const indiceActual = pasos.findIndex((paso) => paso.id === pasoActualId);
  const porcentaje = pasos.length > 0 ? ((indiceActual + 1) / pasos.length) * 100 : 0;

  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold text-teal-800">Armá tu perfil</h1>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={indiceActual + 1}
        aria-valuemin={1}
        aria-valuemax={pasos.length}
        aria-label={`Paso ${indiceActual + 1} de ${pasos.length}`}
      >
        <div
          className="h-full rounded-full bg-teal-700 transition-all"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pasos para armar tu perfil">
        {pasos.map((paso, indice) => {
          const habilitado = indice <= maxPasoIndex;
          const activo = paso.id === pasoActualId;
          return (
            <button
              key={paso.id}
              type="button"
              role="tab"
              aria-selected={activo}
              disabled={!habilitado}
              onClick={() => onIrAPaso(paso.id)}
              className={`min-h-11 rounded-full border px-3 text-sm font-semibold transition ${
                activo
                  ? "border-teal-700 bg-teal-700 text-white"
                  : habilitado
                    ? "border-teal-700 text-teal-800 hover:bg-teal-50"
                    : "border-slate-200 text-slate-400"
              }`}
            >
              {paso.etiqueta}
            </button>
          );
        })}
      </div>
    </header>
  );
}
