import { Link } from "react-router-dom";

interface AsistenteHeaderProps {
  paso: number;
  totalPasos?: number;
  titulo: string;
  volverA: string;
}

/** Encabezado compartido por CL-02 a CL-06: volver, indicador de paso y barra de progreso. */
export function AsistenteHeader({ paso, totalPasos = 5, titulo, volverA }: AsistenteHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link
          to={volverA}
          aria-label="Volver al paso anterior"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Paso {paso} de {totalPasos}
        </p>
      </div>

      <h1 className="text-2xl font-bold text-teal-800">{titulo}</h1>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={paso}
        aria-valuemin={1}
        aria-valuemax={totalPasos}
        aria-label={`Paso ${paso} de ${totalPasos}`}
      >
        <div
          className="h-full rounded-full bg-teal-700 transition-all"
          style={{ width: `${(paso / totalPasos) * 100}%` }}
        />
      </div>
    </header>
  );
}
