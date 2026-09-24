interface SelectorEstrellasProps {
  valor: number | null;
  onChange: (valor: number) => void;
}

const PUNTAJES = [1, 2, 3, 4, 5] as const;

/**
 * CL-11: puntaje de 1 a 5 estrellas sin librería externa. Cada estrella es un
 * botón (no un <input type="radio">) porque no hace falta el semántico de
 * grupo de radios completo para esto: aria-pressed + aria-label alcanzan, y
 * cada botón ya es tabulable y activable con teclado por default.
 */
export function SelectorEstrellas({ valor, onChange }: SelectorEstrellasProps) {
  return (
    <div role="group" aria-label="Puntaje de 1 a 5 estrellas" className="flex gap-1">
      {PUNTAJES.map((puntaje) => {
        const marcada = valor !== null && puntaje <= valor;
        return (
          <button
            key={puntaje}
            type="button"
            aria-pressed={valor === puntaje}
            aria-label={`${puntaje} ${puntaje === 1 ? "estrella" : "estrellas"}`}
            onClick={() => onChange(puntaje)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl text-amber-500 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          >
            <span aria-hidden="true">{marcada ? "★" : "☆"}</span>
          </button>
        );
      })}
    </div>
  );
}
