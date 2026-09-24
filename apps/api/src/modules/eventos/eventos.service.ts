import { Injectable, NotFoundException } from "@nestjs/common";
import type { RegistrarEvento, RegistrarPostulacionIniciada } from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

export interface DatosEvento {
  tipo: string;
  categoria?: string | null;
  zona?: string | null;
  rol?: string | null;
  usuarioId?: string | null;
  pedidoId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * docs/dominio.md §10/§14: eventos de analitica, siempre con categoria, zona
 * y rol. Sin repositorio ni abstraccion extra: dos metodos, Prisma directo
 * (CLAUDE.md regla anti-sobreingenieria #2).
 */
@Injectable()
export class EventosService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(datos: DatosEvento): Promise<void> {
    await this.prisma.eventoAnalitico.create({
      data: {
        tipo: datos.tipo,
        categoria: datos.categoria ?? null,
        zona: datos.zona ?? null,
        rol: datos.rol ?? null,
        usuarioId: datos.usuarioId ?? null,
        pedidoId: datos.pedidoId ?? null,
        metadata: datos.metadata,
      },
    });
  }

  /**
   * Eventos que dispara el cliente desde el asistente, sin sesion
   * (`registrarEventoSchema` en @fixeo/shared). Solo llegan ids: se resuelven
   * contra el catalogo aca, para que "categoria" y "zona" sean siempre
   * valores reales, nunca texto libre que mande el cliente.
   */
  async registrarDelCliente(datos: RegistrarEvento): Promise<void> {
    const [categoria, barrio] = await Promise.all([
      datos.categoriaId
        ? this.prisma.categoria.findUnique({
            where: { id: datos.categoriaId },
            select: { slug: true },
          })
        : null,
      datos.barrioId
        ? this.prisma.barrio.findUnique({ where: { id: datos.barrioId }, select: { nombre: true } })
        : null,
    ]);

    await this.registrar({
      tipo: datos.tipo,
      categoria: categoria?.slug ?? null,
      zona: barrio?.nombre ?? null,
      rol: "cliente",
      metadata: datos.paso ? { paso: datos.paso } : undefined,
    });
  }

  /**
   * PR-04 (docs/dominio.md §10): lo dispara el profesional al abrir el
   * formulario de postulacion (no al enviarla: eso ya es
   * `postulacion_enviada`, en PostulacionesService). Resuelve categoria/zona
   * reales contra el pedido, mismo criterio que `registrarDelCliente`.
   */
  async registrarPostulacionIniciada(
    usuarioId: string,
    datos: RegistrarPostulacionIniciada,
  ): Promise<void> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: datos.pedidoId },
      include: { categoria: { select: { slug: true } }, barrio: { select: { nombre: true } } },
    });
    if (!pedido) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    await this.registrar({
      tipo: "postulacion_iniciada",
      categoria: pedido.categoria.slug,
      zona: pedido.barrio.nombre,
      rol: "profesional",
      usuarioId,
      pedidoId: pedido.id,
    });
  }
}
