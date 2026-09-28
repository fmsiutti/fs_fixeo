interface TarjetaMetricaProps {
  etiqueta: string;
  valor: number | null;
  formatear?: (valor: number) => string;
  objetivo?: string;
}

/** AD-05 · una metrica del tablero, con "Sin datos en el rango" en vez de null/NaN. */
export function TarjetaMetrica({
  etiqueta,
  valor,
  formatear = (v) => String(v),
  objetivo,
}: TarjetaMetricaProps) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 p-4">
      <span className="text-sm font-medium text-slate-600">{etiqueta}</span>
      <span className="text-2xl font-bold text-teal-800">
        {valor === null ? "Sin datos en el rango" : formatear(valor)}
      </span>
      {objetivo && <span className="text-xs text-slate-500">Objetivo: {objetivo}</span>}
    </div>
  );
}
