import type { Urgencia } from "@fixeo/shared";
import { ETIQUETAS_URGENCIA } from "../../pedidos/etiquetas";
import type { FiltrosFeedTrabajos } from "../api";

interface OpcionCategoria {
  id: string;
  nombre: string;
}

interface FiltrosFeedTrabajosFormProps {
  categoriasOficio: OpcionCategoria[];
  mostrarFiltroDistancia: boolean;
  filtros: FiltrosFeedTrabajos;
  onCambiar: (filtros: FiltrosFeedTrabajos) => void;
}

const inputClasesBase =
  "min-h-11 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700";

/** PR-02: filtros de oficio, distancia, urgencia, con fotos y sin postulaciones. */
export function FiltrosFeedTrabajos({
  categoriasOficio,
  mostrarFiltroDistancia,
  filtros,
  onCambiar,
}: FiltrosFeedTrabajosFormProps) {
  return (
    <section aria-label="Filtros de pedidos" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtro-oficio" className="text-sm font-medium text-slate-700">
            Oficio
          </label>
          <select
            id="filtro-oficio"
            className={inputClasesBase}
            value={filtros.categoriaId ?? ""}
            onChange={(evento) =>
              onCambiar({
                ...filtros,
                categoriaId: evento.target.value === "" ? undefined : evento.target.value,
              })
            }
          >
            <option value="">Todos</option>
            {categoriasOficio.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtro-urgencia" className="text-sm font-medium text-slate-700">
            Urgencia
          </label>
          <select
            id="filtro-urgencia"
            className={inputClasesBase}
            value={filtros.urgencia ?? ""}
            onChange={(evento) =>
              onCambiar({
                ...filtros,
                urgencia:
                  evento.target.value === "" ? undefined : (evento.target.value as Urgencia),
              })
            }
          >
            <option value="">Todas</option>
            {Object.entries(ETIQUETAS_URGENCIA).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mostrarFiltroDistancia && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="filtro-distancia" className="text-sm font-medium text-slate-700">
            Distancia máxima (km)
          </label>
          <input
            id="filtro-distancia"
            type="number"
            inputMode="numeric"
            min={1}
            className={inputClasesBase}
            value={filtros.distanciaMaxKm ?? ""}
            onChange={(evento) => {
              const valor = evento.target.value;
              onCambiar({
                ...filtros,
                distanciaMaxKm: valor === "" ? undefined : Number(valor),
              });
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-slate-300 text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700"
            checked={filtros.conFotos ?? false}
            onChange={(evento) =>
              onCambiar({ ...filtros, conFotos: evento.target.checked || undefined })
            }
          />
          Con fotos
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-slate-300 text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700"
            checked={filtros.sinPostulaciones ?? false}
            onChange={(evento) =>
              onCambiar({ ...filtros, sinPostulaciones: evento.target.checked || undefined })
            }
          />
          Sin postulaciones
        </label>
      </div>
    </section>
  );
}
