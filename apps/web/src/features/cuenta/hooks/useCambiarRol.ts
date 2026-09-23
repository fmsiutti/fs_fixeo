import { useMutation } from "@tanstack/react-query";
import { cambiarRol } from "../api";

/** Compartido por CO-03 (primera vez) y CO-06 (cambio de rol reversible). */
export function useCambiarRol() {
  return useMutation({ mutationFn: cambiarRol });
}
