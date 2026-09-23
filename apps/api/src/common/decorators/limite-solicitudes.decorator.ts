import { SetMetadata } from "@nestjs/common";

export interface OpcionesLimiteSolicitudes {
  maximo: number;
  ventanaMs: number;
}

export const LIMITE_SOLICITUDES_KEY = "limiteSolicitudes";

export const LimiteSolicitudes = (opciones: OpcionesLimiteSolicitudes) =>
  SetMetadata(LIMITE_SOLICITUDES_KEY, opciones);
