/**
 * Heuristica pura (sin dependencias) para detectar telefonos, emails y
 * usuarios de redes sociales en texto libre.
 *
 * Vive aca -y no en un modulo de apps/api- porque CLAUDE.md exige detectar
 * estos datos en dos lugares del backend (descripcion de pedido, mensaje de
 * postulacion) y ademas en el front mientras el usuario escribe (ficha
 * CL-03: "Detecta telefonos y correos y advierte"). Es la unica excepcion a
 * "packages/shared es solo schemas": duplicar el regex en dos runtimes
 * distintos los desincroniza tarde o temprano.
 *
 * Es una heuristica de proteccion al cliente, no un filtro perfecto: prioriza
 * no dejar pasar casos obvios por sobre no tener nunca un falso positivo.
 */

export type TipoDatoContacto = "telefono" | "email" | "red_social";

export interface DeteccionDatosContacto {
  detectado: boolean;
  tipos: TipoDatoContacto[];
}

const REGEX_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const REGEX_RED_SOCIAL =
  /(wa\.me\/|api\.whatsapp\.com|instagram\.com\/|facebook\.com\/|fb\.com\/|t\.me\/|telegram\.me\/|tiktok\.com\/|twitter\.com\/|x\.com\/|@[a-z0-9_.]{3,})/i;

// Corridas de digitos con separadores tipicos (espacio, guion, punto,
// parentesis) de al menos 8 caracteres, de los cuales al menos 8 sean
// digitos reales: cubre formatos como "11 4444-5555", "(011)44445555",
// "+54 9 11 2233 4455", sin marcar como telefono numeros cortos sueltos
// (una altura, una cantidad de ambientes, etc.).
const REGEX_CANDIDATO_TELEFONO = /[\d()+\-.\s]{8,}/g;
const MINIMO_DIGITOS_TELEFONO = 8;

function contieneTelefono(texto: string): boolean {
  const candidatos = texto.match(REGEX_CANDIDATO_TELEFONO) ?? [];
  return candidatos.some(
    (candidato) => candidato.replace(/\D/g, "").length >= MINIMO_DIGITOS_TELEFONO,
  );
}

export function detectarDatosDeContacto(texto: string): DeteccionDatosContacto {
  const tipos: TipoDatoContacto[] = [];
  if (contieneTelefono(texto)) tipos.push("telefono");
  if (REGEX_EMAIL.test(texto)) tipos.push("email");
  if (REGEX_RED_SOCIAL.test(texto)) tipos.push("red_social");
  return { detectado: tipos.length > 0, tipos };
}
