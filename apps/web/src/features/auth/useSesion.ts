import { useContext } from "react";
import { SesionContext, type SesionContextValor } from "./SesionContext";

export function useSesion(): SesionContextValor {
  const contexto = useContext(SesionContext);
  if (!contexto) {
    throw new Error("useSesion debe usarse dentro de un SesionProvider");
  }
  return contexto;
}
