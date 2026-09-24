import { describe, expect, it } from "vitest";
import { armarUrlWhatsapp } from "./whatsapp";

describe("armarUrlWhatsapp", () => {
  it("quita el signo + del telefono E.164", () => {
    const url = armarUrlWhatsapp("+5491122334455", "Hola");

    expect(url.startsWith("https://wa.me/5491122334455?")).toBe(true);
    expect(url).not.toContain("+");
  });

  it("codifica el mensaje con encodeURIComponent", () => {
    const mensaje = "Hola! ¿Podés pasar mañana?";
    const url = armarUrlWhatsapp("+5491122334455", mensaje);

    expect(url).toContain(`text=${encodeURIComponent(mensaje)}`);
  });

  it("arma la url completa con numero y mensaje", () => {
    const url = armarUrlWhatsapp("+5491122334455", "Hola");

    expect(url).toBe("https://wa.me/5491122334455?text=Hola");
  });
});
