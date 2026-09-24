import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException } from "@nestjs/common";
import type { EstadoPostulacion } from "@fixeo/shared";
import type { Postulacion, Prisma } from "../../generated/prisma/client.js";
import { transicionar, validarTransicion } from "./postulaciones.estados.js";

function crearPostulacion(overrides: Partial<Postulacion> = {}): Postulacion {
  return {
    id: "postulacion-1",
    pedidoId: "pedido-1",
    profesionalId: "perfil-1",
    mensaje: "Puedo pasar mañana a la tarde a revisar la instalación",
    estimacionMin: null,
    estimacionMax: null,
    estimacionADefinir: true,
    disponibilidad: null,
    estado: "enviada",
    enviadaEn: new Date("2026-01-01T00:00:00.000Z"),
    vistaEn: null,
    descartadaEn: null,
    ...overrides,
  } as Postulacion;
}

interface ResultadoUpdateMany {
  count: number;
}

function crearTxMock(
  postulacion: Postulacion,
  resultadoUpdate: ResultadoUpdateMany = { count: 1 },
) {
  const tx: {
    postulacion: {
      updateMany: jest.Mock<(args: unknown) => Promise<ResultadoUpdateMany>>;
      findUniqueOrThrow: jest.Mock<(args: unknown) => Promise<Postulacion>>;
    };
  } = {
    postulacion: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  tx.postulacion.updateMany.mockResolvedValue(resultadoUpdate);
  tx.postulacion.findUniqueOrThrow.mockResolvedValue(postulacion);
  return tx;
}

describe("validarTransicion", () => {
  it.each([
    ["enviada", "vista"],
    ["enviada", "descartada"],
    ["enviada", "retirada"],
    ["enviada", "caducada"],
    ["enviada", "seleccionada"],
    ["vista", "descartada"],
    ["vista", "retirada"],
    ["vista", "caducada"],
    ["vista", "seleccionada"],
    // docs/dominio.md §4: descarte reversible durante 24 h.
    ["descartada", "vista"],
    // docs/dominio.md §4: "rechazar despues de ser elegido queda registrado".
    ["seleccionada", "retirada"],
  ] as const)("permite %s -> %s", (origen: EstadoPostulacion, destino: EstadoPostulacion) => {
    expect(() => validarTransicion(origen, destino)).not.toThrow();
  });

  it.each([
    ["retirada", "vista"],
    ["caducada", "vista"],
    ["descartada", "enviada"],
    ["seleccionada", "enviada"],
    ["seleccionada", "descartada"],
  ] as const)("prohibe %s -> %s", (origen: EstadoPostulacion, destino: EstadoPostulacion) => {
    expect(() => validarTransicion(origen, destino)).toThrow(ConflictException);
  });
});

describe("transicionar", () => {
  it("actualiza el estado condicionado al origen y devuelve la postulacion actualizada", async () => {
    const postulacion = crearPostulacion({ estado: "vista" });
    const tx = crearTxMock(postulacion);

    const resultado = await transicionar(
      tx as unknown as Prisma.TransactionClient,
      "postulacion-1",
      "enviada",
      "vista",
    );

    expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { id: "postulacion-1", estado: "enviada" },
      data: { estado: "vista" },
    });
    expect(resultado).toBe(postulacion);
  });

  it("acepta datos adicionales (p. ej. vistaEn/descartadaEn) junto con el estado", async () => {
    const postulacion = crearPostulacion({ estado: "descartada" });
    const tx = crearTxMock(postulacion);
    const ahora = new Date("2026-01-02T00:00:00.000Z");

    await transicionar(
      tx as unknown as Prisma.TransactionClient,
      "postulacion-1",
      "vista",
      "descartada",
      { descartadaEn: ahora },
    );

    expect(tx.postulacion.updateMany).toHaveBeenCalledWith({
      where: { id: "postulacion-1", estado: "vista" },
      data: { descartadaEn: ahora, estado: "descartada" },
    });
  });

  it("rechaza una transicion invalida sin llegar a tocar la base", async () => {
    const tx = crearTxMock(crearPostulacion());

    await expect(
      transicionar(tx as unknown as Prisma.TransactionClient, "postulacion-1", "retirada", "vista"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.postulacion.updateMany).not.toHaveBeenCalled();
  });

  it("informa conflicto si el estado ya cambio entre la lectura previa y esta escritura (guarda de concurrencia)", async () => {
    const tx = crearTxMock(crearPostulacion(), { count: 0 });

    await expect(
      transicionar(tx as unknown as Prisma.TransactionClient, "postulacion-1", "enviada", "vista"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.postulacion.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
