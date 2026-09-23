import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Input con label asociado y mensaje de error accesible (aria-invalid + aria-describedby). */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, id, className = "", ...props },
  ref,
) {
  // Si no viene `id` ni `name` (ej. un input sin binding a react-hook-form),
  // useId() igual da un id estable para que el label y el error queden
  // asociados en vez de colgar de `undefined`.
  const idGenerado = useId();
  const inputId = id ?? props.name ?? idGenerado;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`min-h-11 rounded-lg border px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
          error ? "border-red-500" : "border-slate-300"
        } ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
});
