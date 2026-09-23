import { useEffect, useState } from "react";

const SEGUNDOS_ESPERA = 30;

/** Cuenta regresiva para habilitar el reenvio del codigo OTP (CO-02: "reenvío a los 30 s"). */
export function useContadorReenvio(): {
  segundosRestantes: number;
  puedeReenviar: boolean;
  reiniciar: () => void;
} {
  const [segundosRestantes, setSegundosRestantes] = useState(0);

  useEffect(() => {
    if (segundosRestantes <= 0) return;
    const id = window.setTimeout(() => setSegundosRestantes((actual) => actual - 1), 1000);
    return () => window.clearTimeout(id);
  }, [segundosRestantes]);

  return {
    segundosRestantes,
    puedeReenviar: segundosRestantes <= 0,
    reiniciar: () => setSegundosRestantes(SEGUNDOS_ESPERA),
  };
}
