import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { TwilioLogDriver } from "./twilio-log.driver.js";

/**
 * El mapa de codigos es `private` solo a nivel de TypeScript (se borra al compilar),
 * asi que podemos leerlo directo en el test para saber que codigo se genero, en vez
 * de parsear el mensaje de log o pisar Math.random.
 */
interface DriverConMapaInterno {
  codigos: Map<string, { codigo: string; expiraEn: number }>;
}

function leerCodigo(driver: TwilioLogDriver, telefono: string): string {
  const interno = driver as unknown as DriverConMapaInterno;
  const guardado = interno.codigos.get(telefono);
  if (!guardado) throw new Error(`No se genero un codigo para ${telefono}`);
  return guardado.codigo;
}

describe("TwilioLogDriver", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("un codigo usado una vez no vuelve a servir", async () => {
    const driver = new TwilioLogDriver();
    const telefono = "+5491100000010";
    await driver.enviarCodigo(telefono, "sms");
    const codigo = leerCodigo(driver, telefono);

    await expect(driver.verificarCodigo(telefono, codigo)).resolves.toBe(true);
    await expect(driver.verificarCodigo(telefono, codigo)).resolves.toBe(false);
  });

  it("un codigo vencido no sirve", async () => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
    const driver = new TwilioLogDriver();
    const telefono = "+5491100000011";
    await driver.enviarCodigo(telefono, "sms");
    const codigo = leerCodigo(driver, telefono);

    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    await expect(driver.verificarCodigo(telefono, codigo)).resolves.toBe(false);
  });

  it("los codigos de telefonos distintos no se pisan entre si", async () => {
    const driver = new TwilioLogDriver();
    const telefonoA = "+5491100000012";
    const telefonoB = "+5491100000013";
    await driver.enviarCodigo(telefonoA, "sms");
    await driver.enviarCodigo(telefonoB, "sms");
    const codigoA = leerCodigo(driver, telefonoA);
    const codigoB = leerCodigo(driver, telefonoB);

    // Usar el codigo de A no invalida el de B, aunque coincidan en valor.
    await expect(driver.verificarCodigo(telefonoA, codigoA)).resolves.toBe(true);
    await expect(driver.verificarCodigo(telefonoB, codigoB)).resolves.toBe(true);
  });

  it("rechaza un codigo que no corresponde al telefono", async () => {
    const driver = new TwilioLogDriver();
    const telefono = "+5491100000014";
    await driver.enviarCodigo(telefono, "sms");
    const codigoCorrecto = leerCodigo(driver, telefono);
    // "999999" nunca es el codigo maestro (000000) ni, en la practica, el generado.
    const codigoIncorrecto = codigoCorrecto === "999999" ? "888888" : "999999";

    await expect(driver.verificarCodigo(telefono, codigoIncorrecto)).resolves.toBe(false);
  });

  it("el codigo maestro 000000 sirve para cualquier telefono, incluso sin haber pedido uno antes", async () => {
    const driver = new TwilioLogDriver();
    const telefono = "+5491100000015";

    await expect(driver.verificarCodigo(telefono, "000000")).resolves.toBe(true);
  });

  it("el codigo real nunca puede coincidir con el maestro (el generador nunca produce 000000)", async () => {
    const driver = new TwilioLogDriver();
    const telefono = "+5491100000016";
    await driver.enviarCodigo(telefono, "sms");

    expect(leerCodigo(driver, telefono)).not.toBe("000000");
  });

  it("el codigo maestro invalida un codigo real pendiente para ese telefono", async () => {
    const driver = new TwilioLogDriver();
    const telefono = "+5491100000017";
    await driver.enviarCodigo(telefono, "sms");
    const codigoReal = leerCodigo(driver, telefono);

    await expect(driver.verificarCodigo(telefono, "000000")).resolves.toBe(true);
    await expect(driver.verificarCodigo(telefono, codigoReal)).resolves.toBe(false);
  });
});
