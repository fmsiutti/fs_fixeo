import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CrearNotaInterna,
  NotaInternaVista,
  SuspenderUsuario,
  UsuarioBusquedaPagina,
  UsuarioDetalleAdminVista,
  UsuarioVista,
} from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  ESTADOS_PEDIDO_ACTIVO,
  transicionar as transicionarPedido,
} from "../pedidos/pedidos.estados.js";
import { NotificacionesService } from "../notificaciones/notificaciones.service.js";
import {
  caducarPostulacionesAbiertas,
  transicionar as transicionarPostulacion,
} from "../postulaciones/postulaciones.estados.js";
import {
  mapearNotaInternaAVista,
  mapearUsuarioABusquedaVista,
  mapearUsuarioADetalleAdminVista,
  mapearUsuarioAVista,
} from "./usuarios.vistas.js";

// D15: estados "abiertos" de Postulacion, los que la suspension de su
// profesional caduca.
const ESTADOS_POSTULACION_ABIERTA = ["enviada", "vista"] as const;

const TAMANIO_PAGINA = 20;
const TOPE_PEDIDOS_DETALLE = 20;

const INCLUDE_AUTOR_NOTA = { autor: { select: { nombre: true, apellido: true } } } as const;

/**
 * AD-03: gestion de usuarios desde el back office. Caso de uso distinto de
 * UsuariosService (autogestion del propio usuario, "usuarios/yo"), mismo
 * criterio que separa VerificacionesService de un futuro
 * "verificaciones propias" (CLAUDE.md raiz, anti-sobreingenieria #8).
 */
@Injectable()
export class UsuariosAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** Busqueda por telefono, nombre o apellido; sin texto, lista general. Cuentas eliminadas quedan afuera. */
  async buscar(texto: string | undefined, cursorId?: string): Promise<UsuarioBusquedaPagina> {
    const filtroTexto = texto
      ? {
          OR: [
            { telefono: { contains: texto } },
            { nombre: { contains: texto, mode: "insensitive" as const } },
            { apellido: { contains: texto, mode: "insensitive" as const } },
          ],
        }
      : {};

    const usuarios = await this.prisma.usuario.findMany({
      where: { estado: { not: "eliminado" }, ...filtroTexto },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      take: TAMANIO_PAGINA + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    const hayMas = usuarios.length > TAMANIO_PAGINA;
    const pagina = hayMas ? usuarios.slice(0, TAMANIO_PAGINA) : usuarios;

    return {
      items: pagina.map(mapearUsuarioABusquedaVista),
      cursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }

  async obtenerDetalle(usuarioId: string): Promise<UsuarioDetalleAdminVista> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El usuario no existe" });
    }

    const [pedidos, perfil, notas, denunciasHechas] = await Promise.all([
      this.prisma.pedido.findMany({
        where: { clienteId: usuarioId },
        select: { id: true, descripcion: true, estado: true, creadoEn: true },
        orderBy: { creadoEn: "desc" },
        take: TOPE_PEDIDOS_DETALLE,
      }),
      this.prisma.perfilProfesional.findUnique({
        where: { usuarioId },
        select: {
          id: true,
          estadoVerificacion: true,
          pausado: true,
          cantidadResenias: true,
          promedioResenias: true,
          trabajosCerrados: true,
        },
      }),
      this.prisma.notaInterna.findMany({
        where: { usuarioId },
        include: INCLUDE_AUTOR_NOTA,
        orderBy: { creadaEn: "desc" },
      }),
      this.prisma.denuncia.count({ where: { reportanteId: usuarioId } }),
    ]);

    // Un usuario puede ser denunciado por 3 vias distintas (no solo su perfil
    // profesional): como cliente, a traves de sus pedidos; como profesional,
    // a traves de su perfil y de sus postulaciones. `pedidos` de arriba esta
    // truncado a TOPE_PEDIDOS_DETALLE (es para mostrar el historial, no para
    // contar), asi que aca se pide el conjunto completo de ids sin `take`.
    const idsPedidosComoCliente = await this.prisma.pedido.findMany({
      where: { clienteId: usuarioId },
      select: { id: true },
    });
    const idsPostulaciones = perfil
      ? await this.prisma.postulacion.findMany({
          where: { profesionalId: perfil.id },
          select: { id: true },
        })
      : [];

    const [denunciasPerfil, denunciasPedidos, denunciasPostulaciones] = await Promise.all([
      perfil
        ? this.prisma.denuncia.count({ where: { tipoObjeto: "perfil", objetoId: perfil.id } })
        : Promise.resolve(0),
      idsPedidosComoCliente.length > 0
        ? this.prisma.denuncia.count({
            where: {
              tipoObjeto: "pedido",
              objetoId: { in: idsPedidosComoCliente.map((pedido) => pedido.id) },
            },
          })
        : Promise.resolve(0),
      idsPostulaciones.length > 0
        ? this.prisma.denuncia.count({
            where: {
              tipoObjeto: "postulacion",
              objetoId: { in: idsPostulaciones.map((postulacion) => postulacion.id) },
            },
          })
        : Promise.resolve(0),
    ]);
    const denunciasRecibidas = denunciasPerfil + denunciasPedidos + denunciasPostulaciones;

    return mapearUsuarioADetalleAdminVista(usuario, {
      notas,
      pedidos,
      perfilProfesional: perfil,
      denunciasHechas,
      denunciasRecibidas,
    });
  }

  async suspender(
    moderadorId: string,
    usuarioId: string,
    datos: SuspenderUsuario,
  ): Promise<UsuarioVista> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El usuario no existe" });
    }
    if (usuario.estado !== "activo") {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este usuario ya no está activo",
      });
    }

    const { usuarioActualizado, idsPedidosBloqueados } = await this.prisma.$transaction(
      async (tx) => {
        // updateMany condicional al estado de origen: guarda de concurrencia
        // atomica (mismo patron que transicionar()), ademas del chequeo
        // rapido de arriba que evita abrir una transaccion en el caso comun.
        const resultado = await tx.usuario.updateMany({
          where: { id: usuarioId, estado: "activo" },
          data: { estado: "suspendido" },
        });
        if (resultado.count === 0) {
          throw new ConflictException({
            codigo: "conflicto",
            mensaje: "Este usuario ya no está activo",
          });
        }
        // Mismo bloque que UsuariosService.eliminar: sin sesiones activas, la
        // suspension es inmediata.
        await tx.refreshToken.updateMany({
          where: { usuarioId, revocadoEn: null },
          data: { revocadoEn: new Date() },
        });
        await tx.notaInterna.create({
          data: {
            usuarioId,
            autorId: moderadorId,
            texto: `Usuario suspendido: ${datos.motivo}`,
          },
        });

        // D15: pedidos activos del usuario como cliente pasan a "bloqueado" por
        // la maquina de estados, con los mismos avisos de D5 (transicionar()
        // deja el motivoModeracion). Sus postulaciones abiertas de OTROS
        // profesionales tambien caducan (docs/dominio.md §4, tabla D2). Sin
        // notificacion al cliente aca: no tiene sesion activa para verla; los
        // profesionales ya elegidos si se avisan, despues de la transaccion.
        const pedidosActivos = await tx.pedido.findMany({
          where: { clienteId: usuarioId, estado: { in: [...ESTADOS_PEDIDO_ACTIVO] } },
          select: { id: true, estado: true },
        });
        const idsPedidosBloqueados: string[] = [];
        for (const pedido of pedidosActivos) {
          await transicionarPedido(tx, pedido.id, pedido.estado, "bloqueado", {
            motivoModeracion: "Cuenta del cliente suspendida",
          });
          await caducarPostulacionesAbiertas(tx, pedido.id);
          idsPedidosBloqueados.push(pedido.id);
        }

        // D15: si el usuario es profesional, sus propias postulaciones
        // abiertas en otros pedidos caducan.
        const perfil = await tx.perfilProfesional.findUnique({
          where: { usuarioId },
          select: { id: true },
        });
        if (perfil) {
          const postulacionesAbiertas = await tx.postulacion.findMany({
            where: { profesionalId: perfil.id, estado: { in: [...ESTADOS_POSTULACION_ABIERTA] } },
            select: { id: true, estado: true },
          });
          for (const postulacion of postulacionesAbiertas) {
            await transicionarPostulacion(tx, postulacion.id, postulacion.estado, "caducada");
          }
        }

        const usuarioActualizado = await tx.usuario.findUniqueOrThrow({
          where: { id: usuarioId },
        });
        return { usuarioActualizado, idsPedidosBloqueados };
      },
    );

    // D5: avisa a cada profesional que ya estaba elegido en alguno de los
    // pedidos bloqueados por esta cascada (si llegaron a tener algun
    // Contacto), fuera de la transaccion, mismo criterio que el resto de las
    // notificaciones del back office.
    await this.avisarElegidosPedidosBloqueados(idsPedidosBloqueados);

    return mapearUsuarioAVista(usuarioActualizado);
  }

  async reactivar(moderadorId: string, usuarioId: string): Promise<UsuarioVista> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El usuario no existe" });
    }
    if (usuario.estado !== "suspendido") {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este usuario no está suspendido",
      });
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const resultado = await tx.usuario.updateMany({
        where: { id: usuarioId, estado: "suspendido" },
        data: { estado: "activo" },
      });
      if (resultado.count === 0) {
        throw new ConflictException({
          codigo: "conflicto",
          mensaje: "Este usuario no está suspendido",
        });
      }
      await tx.notaInterna.create({
        data: { usuarioId, autorId: moderadorId, texto: "Usuario reactivado" },
      });
      return tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    });

    return mapearUsuarioAVista(actualizado);
  }

  /**
   * D5: mismo aviso que PedidosModeracionService.resolverDenuncia para
   * bloqueo por denuncia, pero aca sobre el lote de pedidos que bloqueo esta
   * suspension de usuario (D15).
   */
  private async avisarElegidosPedidosBloqueados(idsPedidos: string[]): Promise<void> {
    if (idsPedidos.length === 0) return;

    const contactos = await this.prisma.contacto.findMany({
      where: { pedidoId: { in: idsPedidos } },
      select: {
        pedidoId: true,
        postulacion: { select: { profesional: { select: { usuarioId: true } } } },
      },
    });
    if (contactos.length === 0) return;

    await this.notificaciones.crearVarias(
      contactos.map((contacto) => ({
        usuarioId: contacto.postulacion.profesional.usuarioId,
        // Fix 4: tipo propio (el profesional no puede ver /pedidos/:id).
        tipo: "pedido_bloqueado_elegido",
        objetoId: contacto.pedidoId,
      })),
    );
  }

  async crearNota(
    moderadorId: string,
    usuarioId: string,
    datos: CrearNotaInterna,
  ): Promise<NotaInternaVista> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true },
    });
    if (!usuario) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El usuario no existe" });
    }

    const nota = await this.prisma.notaInterna.create({
      data: { usuarioId, autorId: moderadorId, texto: datos.texto },
      include: INCLUDE_AUTOR_NOTA,
    });
    return mapearNotaInternaAVista(nota);
  }
}
