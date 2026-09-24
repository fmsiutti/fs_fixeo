import { describe, expect, it, jest } from "@jest/globals";
import { ConflictException } from "@nestjs/common";
import type { EstadoPedido } from "@fixeo/shared";
import type { Pedido, Prisma } from "../../generated/prisma/client.js";
import { puedeSeleccionar, transicionar, validarTransicion } from "./pedidos.estados.js";

function crearPedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id: "pedido-1",
    clienteId: "cliente-1",
    categoriaId: "categoria-1",
    subcategoria: null,
    descripcion: "Descripcion cualquiera, larga como para pasar el minimo",
    respuestasGuia: null,
    urgencia: "sin_apuro",
    franjas: [],
    direccionId: "direccion-1",
    barrioId: "barrio-1",
    lat: -34.6,
    lng: -58.4,
    estado: "publicado",
    publicadoEn: new Date("2026-01-01T00:00:00.000Z"),
    expiraEn: new Date("2026-01-08T00:00:00.000Z"),
    cierreAutomaticoEn: null,
    desenlacePostergado: false,
    desenlace: null,
    motivoModeracion: null,
    vistas: 0,
    cantidadPostulaciones: 0,
    cantidadContactos: 0,
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as Pedido;
}

interface ResultadoUpdateMany {
  count: number;
}

function crearTxMock(pedido: Pedido, resultadoUpdate: ResultadoUpdateMany = { count: 1 }) {
  const tx: {
    pedido: {
      updateMany: jest.Mock<(args: unknown) => Promise<ResultadoUpdateMany>>;
      findUniqueOrThrow: jest.Mock<(args: unknown) => Promise<Pedido>>;
    };
  } = {
    pedido: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  tx.pedido.updateMany.mockResolvedValue(resultadoUpdate);
  tx.pedido.findUniqueOrThrow.mockResolvedValue(pedido);
  return tx;
}

describe("validarTransicion", () => {
  it.each([
    ["borrador", "publicado"],
    ["borrador", "en_revision"],
    ["en_revision", "publicado"],
    ["en_revision", "bloqueado"],
    // docs/dominio.md §3/§12: agregada a proposito, por encima del texto
    // original de D5 (que solo hablaba de publicado/con_postulaciones). Sin
    // ella, un falso positivo del control automatico de datos de contacto
    // dejaba al cliente sin ninguna salida hasta que exista moderacion
    // (AD-02, slice 9). CL-07 ya decia "en revision: solo se puede cancelar".
    ["en_revision", "cancelado"],
    ["publicado", "cancelado"],
    ["publicado", "con_postulaciones"],
    ["con_postulaciones", "contacto_habilitado"],
    ["con_postulaciones", "cancelado"],
  ] as const)("permite %s -> %s", (origen: EstadoPedido, destino: EstadoPedido) => {
    expect(() => validarTransicion(origen, destino)).not.toThrow();
  });

  it.each([
    ["cancelado", "publicado"],
    ["cerrado", "publicado"],
    ["expirado", "publicado"],
    ["bloqueado", "publicado"],
    ["publicado", "borrador"],
    ["contacto_habilitado", "publicado"],
    // D3: no hay reapertura desde contacto_habilitado, ni siquiera a cancelado
    // por esta via; la unica salida desde ahi es declarar el desenlace.
    ["contacto_habilitado", "cancelado"],
  ] as const)("prohibe %s -> %s", (origen: EstadoPedido, destino: EstadoPedido) => {
    expect(() => validarTransicion(origen, destino)).toThrow(ConflictException);
  });
});

describe("transicionar", () => {
  it("actualiza el estado condicionado al origen y devuelve el pedido actualizado", async () => {
    const pedido = crearPedido({ estado: "cancelado" });
    const tx = crearTxMock(pedido);

    const resultado = await transicionar(
      tx as unknown as Prisma.TransactionClient,
      "pedido-1",
      "publicado",
      "cancelado",
    );

    expect(tx.pedido.updateMany).toHaveBeenCalledWith({
      where: { id: "pedido-1", estado: "publicado" },
      data: { estado: "cancelado" },
    });
    expect(resultado).toBe(pedido);
  });

  it("rechaza una transicion invalida sin llegar a tocar la base", async () => {
    const tx = crearTxMock(crearPedido());

    // D3: no hay reapertura desde contacto_habilitado, ni siquiera a
    // cancelado; sigue prohibida despues de agregar en_revision -> cancelado.
    await expect(
      transicionar(
        tx as unknown as Prisma.TransactionClient,
        "pedido-1",
        "contacto_habilitado",
        "cancelado",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pedido.updateMany).not.toHaveBeenCalled();
  });

  it("informa conflicto si el estado ya cambio entre la lectura previa y esta escritura (guarda de concurrencia)", async () => {
    const tx = crearTxMock(crearPedido(), { count: 0 });

    await expect(
      transicionar(tx as unknown as Prisma.TransactionClient, "pedido-1", "publicado", "cancelado"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pedido.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

// CL-08/D2/D3 (docs/dominio.md §4/§12): usado por ContactosService.seleccionar,
// tanto en el atajo previo a la transaccion como en la revalidacion sobre la
// lectura fresca con lock (mismo criterio que puedeRecibirPostulaciones).
describe("puedeSeleccionar", () => {
  it.each(["publicado", "con_postulaciones", "contacto_habilitado"] as const)(
    "permite elegir con estado '%s' y cupo libre",
    (estado: EstadoPedido) => {
      expect(puedeSeleccionar({ estado, cantidadContactos: 0 }, 3)).toBe(true);
    },
  );

  it.each(["borrador", "en_revision", "cerrado", "expirado", "cancelado", "bloqueado"] as const)(
    "no permite elegir con estado '%s', aunque haya cupo libre",
    (estado: EstadoPedido) => {
      expect(puedeSeleccionar({ estado, cantidadContactos: 0 }, 3)).toBe(false);
    },
  );

  it("permite elegir mientras cantidadContactos sea menor que el cupo maximo", () => {
    expect(puedeSeleccionar({ estado: "contacto_habilitado", cantidadContactos: 2 }, 3)).toBe(true);
  });

  it("no permite elegir cuando ya se completo el cupo de seleccionables (D3: no hay una 4ta seleccion)", () => {
    expect(puedeSeleccionar({ estado: "contacto_habilitado", cantidadContactos: 3 }, 3)).toBe(
      false,
    );
  });

  it("no permite elegir si cantidadContactos ya supera el cupo (defensa extra, no deberia pasar en la practica)", () => {
    expect(puedeSeleccionar({ estado: "contacto_habilitado", cantidadContactos: 4 }, 3)).toBe(
      false,
    );
  });
});
