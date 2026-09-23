import type { ButtonHTMLAttributes } from "react";
import { clasesBoton, type VarianteBoton } from "./clasesBoton";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  cargando?: boolean;
}

/** Boton con area tactil de 44px minimo y estado de carga; area principal siempre a ancho completo. */
export function Button({
  variante = "primario",
  cargando = false,
  disabled = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={clasesBoton(variante, className)} disabled={disabled || cargando} {...props}>
      {cargando ? "Un momento…" : children}
    </button>
  );
}
