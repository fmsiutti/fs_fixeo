import { describe, expect, it, jest } from "@jest/globals";
import { usuarioVistaSchema, type CambiarRol } from "@fixeo/shared";
import type { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { Usuario } from "../../generated/prisma/client.js";
import { UsuariosService } from "./usuarios.service.js";
import { mapearUsuarioAVista } from "./usuarios.vistas.js";

function crearUsuario(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: "usuario-1",
    telefono: "+5491100000020",
    nombre: "Ana",
    apellido: "Gomez",
    email: "ana@example.com",
    fotoUrl: null,
    rolActivo: "cliente",
    estado: "activo",
    creadoEn: new Date("2026-01-01T00:00:00.000Z"),
    ultimoAcceso: null,
    ...overrides,
  } as Usuario;
}

// eliminar() usa $transaction en su forma "callback con tx": simulamos tx con el
// mismo objeto prisma, que es lo unico que el service necesita.
type CallbackTransaccion = (tx: unknown) => Promise<unknown>;

function crearPrismaMock() {
  const prisma: {
    usuario: { update: jest.Mock<(args: unknown) => Promise<Usuario>> };
    refreshToken: { updateMany: jest.Mock<(args: unknown) => Promise<{ count: number }>> };
    $transaction: jest.Mock<(callback: CallbackTransaccion) => Promise<unknown>>;
  } = {
    usuario: { update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: CallbackTransaccion) => callback(prisma));
  return prisma;
}

describe("UsuariosService", () => {
  describe("cambiarRol", () => {
    it.each(["cliente", "profesional"] as const)(
      "acepta y persiste el rol '%s'",
      async (rol: "cliente" | "profesional") => {
        const prisma = crearPrismaMock();
        prisma.usuario.update.mockResolvedValue(crearUsuario({ rolActivo: rol }));
        const service = new UsuariosService(prisma as unknown as PrismaService);

        const vista = await service.cambiarRol("usuario-1", { rol } as CambiarRol);

        expect(prisma.usuario.update).toHaveBeenCalledWith({
          where: { id: "usuario-1" },
          data: { rolActivo: rol },
        });
        expect(vista.rolActivo).toBe(rol);
      },
    );

    // La restriccion a cliente/profesional (nunca moderador/soporte) vive en el
    // schema zod del borde (cambiarRolSchema/ROLES_ELEGIBLES_USUARIO), aplicado
    // por el ZodValidationPipe global antes de llegar aca: el service no valida
    // nada por su cuenta. Ese camino se cubre en el e2e (PATCH /usuarios/yo/rol
    // con rol invalido -> 400), no aca.
  });

  describe("eliminar", () => {
    it("marca estado eliminado, anonimiza el telefono y revoca los refresh tokens activos", async () => {
      const prisma = crearPrismaMock();
      prisma.usuario.update.mockResolvedValue(crearUsuario({ estado: "eliminado" }));
      const service = new UsuariosService(prisma as unknown as PrismaService);

      await service.eliminar("usuario-1");

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: "usuario-1", revocadoEn: null },
        data: { revocadoEn: expect.any(Date) },
      });
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: "usuario-1" },
        data: { estado: "eliminado", telefono: "eliminado:usuario-1" },
      });
    });
  });

  describe("mapearUsuarioAVista", () => {
    it("solo expone los campos de usuarioVistaSchema, aunque la entidad tenga otros", () => {
      const usuarioCrudo = {
        ...crearUsuario(),
        // Simula un campo sensible que Prisma podria devolver a futuro (p. ej. un
        // hash interno): la vista nunca deberia dejarlo pasar.
        campoInternoSensible: "no-deberia-salir",
      } as unknown as Usuario;

      const vista = mapearUsuarioAVista(usuarioCrudo);

      expect(Object.keys(vista).sort()).toEqual(Object.keys(usuarioVistaSchema.shape).sort());
    });

    it("mapea los campos esperados 1 a 1", () => {
      const usuario = crearUsuario();

      const vista = mapearUsuarioAVista(usuario);

      expect(vista).toEqual({
        id: usuario.id,
        telefono: usuario.telefono,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        fotoUrl: usuario.fotoUrl,
        rolActivo: usuario.rolActivo,
        estado: usuario.estado,
        creadoEn: usuario.creadoEn.toISOString(),
      });
    });
  });
});
