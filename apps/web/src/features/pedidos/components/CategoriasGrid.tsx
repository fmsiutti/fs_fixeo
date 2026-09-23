import type { CategoriaVista } from "@fixeo/shared";

interface CategoriasGridProps {
  categorias: CategoriaVista[];
  onSeleccionar: (categoria: CategoriaVista) => void;
  seleccionadaId?: string | null;
  etiqueta: string;
}

/** Grilla de categorias, reusada en CL-01 (navega al asistente) y CL-02 (elige categoria). */
export function CategoriasGrid({
  categorias,
  onSeleccionar,
  seleccionadaId,
  etiqueta,
}: CategoriasGridProps) {
  return (
    <ul className="grid grid-cols-2 gap-3" aria-label={etiqueta}>
      {categorias.map((categoria) => {
        const esOtro = categoria.slug === "otro";
        const seleccionada = categoria.id === seleccionadaId;
        return (
          <li key={categoria.id}>
            <button
              type="button"
              onClick={() => onSeleccionar(categoria)}
              aria-pressed={seleccionada}
              className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center text-sm font-semibold transition ${
                seleccionada
                  ? "border-teal-700 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-800 hover:border-teal-600 hover:bg-teal-50"
              }`}
            >
              <span>{categoria.nombre}</span>
              {esOtro && <span className="text-xs font-normal text-slate-500">Va a revisión</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
