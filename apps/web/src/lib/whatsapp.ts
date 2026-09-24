/**
 * PR-06/CL-10: `https://wa.me/<E164 sin el "+">?text=<mensaje>` con el
 * mensaje prellenado (apps/web/CLAUDE.md). El telefono llega en E.164
 * (ej. "+5491122334455"); wa.me lo espera sin el "+".
 */
export function armarUrlWhatsapp(telefonoE164: string, mensaje: string): string {
  const numero = telefonoE164.replace(/^\+/, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
