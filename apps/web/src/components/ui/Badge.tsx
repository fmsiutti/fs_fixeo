import type { ReactNode } from "react";

export type TonoBadge = "neutro" | "exito" | "advertencia" | "error";

const CLASES_POR_TONO: Record<TonoBadge, string> = {
  neutro: "bg-slate-100 text-slate-700",
  exito: "bg-teal-100 text-teal-800",
  advertencia: "bg-amber-100 text-amber-900",
  error: "bg-red-100 text-red-800",
};

interface BadgeProps {
  tono?: TonoBadge;
  children: ReactNode;
}

/** Etiqueta corta de estado (verificaciones, matriculas), reusada en perfil (PR-07) y admin (AD-01). */
export function Badge({ tono = "neutro", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${CLASES_POR_TONO[tono]}`}
    >
      {children}
    </span>
  );
}
