import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { InternalServerErrorException } from "@nestjs/common";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import { ParametrosService } from "./parametros.service.js";

interface RegistroParametro {
  id: string;
  clave: string;
  valor: unknown;
}

function crearRegistro(overrides: Partial<RegistroParametro> = {}): RegistroParametro {
  return {
    id: "parametro-1",
    clave: "postulaciones_max_por_pedido",
    valor: 8,
    ...overrides,
  };
}

function crearPrismaMock(registros: RegistroParametro[]) {
  const prisma: {
    parametroNegocio: { findMany: jest.Mock<() => Promise<RegistroParametro[]>> };
  } = {
    parametroNegocio: { findMany: jest.fn() },
  };
  prisma.parametroNegocio.findMany.mockResolvedValue(registros);
  return prisma;
}

describe("ParametrosService", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("devuelve el valor numerico correcto para una clave numerica", async () => {
    const prisma = crearPrismaMock([
      crearRegistro({ clave: "postulaciones_max_por_pedido", valor: 8 }),
    ]);
    const service = new ParametrosService(prisma as unknown as PrismaService);

    const valor = await service.getNumero("postulaciones_max_por_pedido");

    expect(valor).toBe(8);
  });

  it("devuelve el valor string correcto para la clave de zona horaria", async () => {
    const prisma = crearPrismaMock([
      crearRegistro({
        clave: "limite_diario_zona_horaria",
        valor: "America/Argentina/Buenos_Aires",
      }),
    ]);
    const service = new ParametrosService(prisma as unknown as PrismaService);

    const valor = await service.getTexto("limite_diario_zona_horaria");

    expect(valor).toBe("America/Argentina/Buenos_Aires");
  });

  it("lanza InternalServerErrorException si la clave no existe (falla de configuracion, no del cliente)", async () => {
    const prisma = crearPrismaMock([crearRegistro()]);
    const service = new ParametrosService(prisma as unknown as PrismaService);

    await expect(service.getNumero("clave_inexistente")).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it("getNumero rechaza un valor que no es numerico (ej. alguien guardo un string por error)", async () => {
    const prisma = crearPrismaMock([
      crearRegistro({ clave: "postulaciones_max_por_pedido", valor: "8" }),
    ]);
    const service = new ParametrosService(prisma as unknown as PrismaService);

    await expect(service.getNumero("postulaciones_max_por_pedido")).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it("getTexto rechaza un valor que no es string", async () => {
    const prisma = crearPrismaMock([
      crearRegistro({ clave: "limite_diario_zona_horaria", valor: 123 }),
    ]);
    const service = new ParametrosService(prisma as unknown as PrismaService);

    await expect(service.getTexto("limite_diario_zona_horaria")).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it("cachea la tabla completa: dos lecturas seguidas dentro de los 60s solo consultan la base una vez", async () => {
    const prisma = crearPrismaMock([crearRegistro()]);
    const service = new ParametrosService(prisma as unknown as PrismaService);

    await service.getNumero("postulaciones_max_por_pedido");
    await service.getNumero("postulaciones_max_por_pedido");

    expect(prisma.parametroNegocio.findMany).toHaveBeenCalledTimes(1);
  });

  it("recarga la cache pasados los 60s de TTL", async () => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
    const prisma = crearPrismaMock([crearRegistro()]);
    const service = new ParametrosService(prisma as unknown as PrismaService);

    await service.getNumero("postulaciones_max_por_pedido");
    await service.getNumero("postulaciones_max_por_pedido");
    expect(prisma.parametroNegocio.findMany).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60_001);
    await service.getNumero("postulaciones_max_por_pedido");

    expect(prisma.parametroNegocio.findMany).toHaveBeenCalledTimes(2);
  });
});
