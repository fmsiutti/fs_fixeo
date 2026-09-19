import { fetchJson } from "../../lib/http";

export interface Salud {
  estado: "ok";
}

export const saludQueryKey = ["salud"] as const;

export function obtenerSalud(): Promise<Salud> {
  return fetchJson<Salud>("/salud");
}
