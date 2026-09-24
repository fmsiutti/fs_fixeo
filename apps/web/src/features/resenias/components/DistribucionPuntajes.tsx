import type { ReseniaVista } from "@fixeo/shared";

const PUNTAJES_DESCENDENTES = [5, 4, 3, 2, 1] as const;

interface DistribucionPuntajesProps {
  resenias: ReseniaVista[];
}

/**
 * CL-09 pide "promedio y distribución". `ReseniaPagina` (packages/shared) no
 * trae un agregado por puntaje, así que se calcula sobre lo que ya está
 * cargado en pantalla: no hay endpoint de agregados en el contrato de este
 * slice y no corresponde pedirle uno nuevo al backend solo para esto. Por eso
 * el título aclara "de las reseñas cargadas" en vez de prometer el total.
 */
export function DistribucionPuntajes({ resenias }: DistribucionPuntajesProps) {
  if (resenias.length === 0) return null;

  const conteos = PUNTAJES_DESCENDENTES.map((puntaje) => ({
    puntaje,
    cantidad: resenias.filter((resenia) => resenia.puntaje === puntaje).length,
  }));
  const maximo = Math.max(...conteos.map((conteo) => conteo.cantidad), 1);

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-semibold text-slate-900">Distribución de las reseñas cargadas</h4>
      <ul className="flex flex-col gap-1">
        {conteos.map(({ puntaje, cantidad }) => (
          <li key={puntaje} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-3 text-right">{puntaje}</span>
            <span aria-hidden="true">★</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span
                className="block h-full rounded-full bg-amber-400"
                style={{ width: `${(cantidad / maximo) * 100}%` }}
              />
            </span>
            <span className="w-6 text-right">{cantidad}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
