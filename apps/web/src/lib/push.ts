/**
 * Convierte la clave publica VAPID (base64 URL-safe, como la devuelve la
 * api en `GET /notificaciones/vapid-clave-publica`) al `Uint8Array` que pide
 * `PushManager.subscribe({ applicationServerKey })`. Es el helper estandar
 * de la comunidad Web Push (no hay libreria en el repo para esto, CLAUDE.md:
 * no agregar dependencias sin preguntar).
 */
export function convertirClaveVapidAUint8Array(claveBase64: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (claveBase64.length % 4)) % 4);
  const base64 = (claveBase64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = window.atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}
