export type VarianteBoton = "primario" | "secundario" | "peligro";

/** Clases compartidas por <Button> y por elementos que necesitan verse como boton (ej. <Link>). */
export function clasesBoton(variante: VarianteBoton = "primario", className = ""): string {
  const base =
    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60";

  const variantes: Record<VarianteBoton, string> = {
    primario: "bg-teal-700 text-white hover:bg-teal-800",
    secundario: "bg-white text-teal-800 border border-teal-700 hover:bg-teal-50",
    peligro: "bg-red-700 text-white hover:bg-red-800",
  };

  return `${base} ${variantes[variante]} ${className}`.trim();
}
