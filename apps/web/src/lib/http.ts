import { errorApiSchema, type CodigoError } from "@fixeo/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** Arma una url absoluta a partir de una ruta relativa que devuelve la api (ej. la url de una foto subida). */
// El driver de storage "log" (desarrollo) devuelve una url relativa
// (/uploads-dev/...) que hay que completar con el origen de la api, pero el
// driver "s3" (produccion) ya devuelve una url absoluta: prefijarla de nuevo
// la rompe ("https://api...https://bucket/..."). Cada driver define su
// propio formato, así que quien consume la url es quien tiene que
// distinguirlos, no el backend.
export function urlCompletaApi(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${API_URL}${url}`;
}

// Access token en memoria (nunca localStorage): se pierde al recargar la pagina
// a proposito, para eso existe el refresh silencioso al montar la app.
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

type ManejadorSesionExpirada = () => void;
let manejadorSesionExpirada: ManejadorSesionExpirada | null = null;

/** El contexto de sesion se engancha aca para enterarse cuando el refresh automatico falla. */
export function registrarManejadorSesionExpirada(manejador: ManejadorSesionExpirada | null): void {
  manejadorSesionExpirada = manejador;
}

/** Error de transporte (respuesta sin cuerpo de error reconocible). */
export class ErrorHttp extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Error de negocio devuelto por la api ({ codigo, mensaje, detalles }). El front decide el texto a partir de `codigo`. */
export class ErrorApiHttp extends Error {
  public readonly codigo: CodigoError;
  public readonly status: number;
  public readonly detalles?: unknown;

  constructor(codigo: CodigoError, mensaje: string, status: number, detalles?: unknown) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
    this.detalles = detalles;
  }

  /** Alias legible del mensaje que mando la api (equivalente a `.message`). */
  get mensaje(): string {
    return this.message;
  }
}

function construirHeaders(headersIniciales: HeadersInit | undefined, esFormData: boolean): Headers {
  const headers = new Headers(headersIniciales);
  // FormData (subida de fotos) necesita que el browser fije su propio
  // Content-Type con el boundary del multipart; si lo forzamos a json rompe la subida.
  if (!esFormData) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

function ejecutar(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: construirHeaders(init.headers, init.body instanceof FormData),
  });
}

let refrescoEnCurso: Promise<boolean> | null = null;

/** Intenta renovar el access token contra la cookie de refresh, sin pasar por fetchJson (evita loops). */
function refrescarTokenSilencioso(): Promise<boolean> {
  if (!refrescoEnCurso) {
    refrescoEnCurso = (async () => {
      try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          return false;
        }
        const datos = (await response.json()) as { accessToken: string };
        accessToken = datos.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        refrescoEnCurso = null;
      }
    })();
  }
  return refrescoEnCurso;
}

async function convertirError(response: Response): Promise<Error> {
  let cuerpo: unknown;
  try {
    cuerpo = await response.json();
  } catch {
    return new ErrorHttp(`Error ${response.status} al pedir la api`, response.status);
  }

  const resultado = errorApiSchema.safeParse(cuerpo);
  if (resultado.success) {
    return new ErrorApiHttp(
      resultado.data.codigo,
      resultado.data.mensaje,
      response.status,
      resultado.data.detalles,
    );
  }
  return new ErrorHttp(`Error ${response.status} al pedir la api`, response.status);
}

async function leerRespuesta<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await convertirError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * Wrapper de fetch con sesion: manda la cookie de refresh siempre, agrega el
 * access token si hay uno en memoria y reintenta una vez tras un 401 usando
 * `POST /auth/refresh`. Si el refresh tambien falla, limpia la sesion y deja
 * que el 401 original se propague para que la pantalla mande a /ingresar.
 */
export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await ejecutar(path, init);

  if (response.status === 401 && path !== "/auth/refresh") {
    const pudoRefrescar = await refrescarTokenSilencioso();
    if (pudoRefrescar) {
      response = await ejecutar(path, init);
    } else {
      accessToken = null;
      manejadorSesionExpirada?.();
    }
  }

  return leerRespuesta<T>(response);
}
