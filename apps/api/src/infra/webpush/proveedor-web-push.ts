export interface SuscripcionPush {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PayloadPush {
  titulo: string;
  cuerpo: string;
  ruta: string;
}

/**
 * Se lanza cuando el proveedor confirma que el endpoint ya no es valido
 * (404/410: el navegador descarto la suscripcion). Quien llama tiene que
 * borrar la fila de `suscripcion_push` correspondiente. Cualquier otro error
 * (red, 5xx transitorio) se relanza tal cual: no hay que borrar nada, es
 * reintentable en el futuro.
 */
export class SuscripcionInvalidaError extends Error {
  constructor(endpoint: string) {
    super(`La suscripcion push ya no es valida: ${endpoint}`);
    this.name = "SuscripcionInvalidaError";
  }
}

/**
 * Borde con el proveedor de Web Push. Dos implementaciones: `log`
 * (desarrollo/tests, sin credenciales) y `vapid` (real, paquete `web-push`).
 */
export interface ProveedorWebPush {
  enviar(suscripcion: SuscripcionPush, payload: PayloadPush): Promise<void>;
}

export const PROVEEDOR_WEB_PUSH = Symbol("PROVEEDOR_WEB_PUSH");
