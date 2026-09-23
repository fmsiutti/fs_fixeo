interface SpinnerProps {
  etiqueta?: string;
}

/** Spinner centrado accesible, para los estados de carga de cada pantalla. */
export function Spinner({ etiqueta = "Cargando" }: SpinnerProps) {
  return (
    <div className="flex items-center justify-center p-6" role="status" aria-live="polite">
      <span className="sr-only">{etiqueta}</span>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-700" />
    </div>
  );
}
