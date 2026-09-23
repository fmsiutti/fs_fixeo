import { describe, expect, it, jest } from "@jest/globals";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { ProveedorAlmacenamiento } from "../../infra/almacenamiento/proveedor-almacenamiento.js";
import type { ParametrosService } from "../parametros/parametros.service.js";
import { ArchivosService } from "./archivos.service.js";
import { clavePedidoFotoBorrador } from "./claves-almacenamiento.js";

function crearAlmacenamientoMock(): ProveedorAlmacenamiento {
  return {
    guardar: jest.fn(),
    eliminar: jest.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined),
    existe: jest.fn(),
    urlPara: jest.fn(),
    contar: jest.fn(),
  } as unknown as ProveedorAlmacenamiento;
}

function crearService(fotoPedidoExistente: { id: string } | null) {
  const almacenamiento = crearAlmacenamientoMock();
  const prisma = {
    fotoPedido: {
      findUnique: jest
        .fn<(args: unknown) => Promise<{ id: string } | null>>()
        .mockResolvedValue(fotoPedidoExistente),
    },
  };
  const service = new ArchivosService(
    almacenamiento,
    {} as ParametrosService,
    prisma as unknown as PrismaService,
  );
  return { service, almacenamiento, prisma };
}

describe("ArchivosService.eliminarFotoBorrador", () => {
  it("borra el archivo del storage cuando el id no pertenece a ningun pedido publicado", async () => {
    const { service, almacenamiento } = crearService(null);

    await service.eliminarFotoBorrador("borrador-1", "foto-1");

    expect(almacenamiento.eliminar).toHaveBeenCalledWith(
      clavePedidoFotoBorrador("borrador-1", "foto-1"),
    );
  });

  // Bloqueante de seguridad: la key de storage de una foto de borrador es la
  // misma que queda publica en la url de la foto ya publicada, asi que
  // cualquiera que vea un pedido publicado conoce el borradorId+id que este
  // endpoint (sin sesion) pide. Sin este chequeo, ese dato alcanza para
  // borrar el archivo real.
  it("no toca el storage cuando el id ya pertenece a un pedido publicado", async () => {
    const { service, almacenamiento, prisma } = crearService({ id: "foto-1" });

    await service.eliminarFotoBorrador("borrador-1", "foto-1");

    expect(prisma.fotoPedido.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "foto-1" } }),
    );
    expect(almacenamiento.eliminar).not.toHaveBeenCalled();
  });
});
