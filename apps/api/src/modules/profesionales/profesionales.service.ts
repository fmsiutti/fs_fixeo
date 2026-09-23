import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ArmarPerfil,
  GuardarOficios,
  PerfilProfesionalVistaPropia,
  ZonaCoberturaInput,
} from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { PerfilProfesional } from "../../generated/prisma/client.js";
import { mapearPerfilAVistaPropia } from "./profesionales.vistas.js";

const PERFIL_NO_ARMADO = {
  codigo: "no_encontrado" as const,
  mensaje: "Todavía no armaste tu perfil profesional",
};

const INCLUDE_VISTA_PROPIA = {
  oficios: { include: { categoria: true }, orderBy: { creadoEn: "asc" as const } },
  zonaCobertura: true,
  verificaciones: { orderBy: { enviadaEn: "asc" as const } },
};

@Injectable()
export class ProfesionalesService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPropio(usuarioId: string): Promise<PerfilProfesionalVistaPropia> {
    const perfil = await this.prisma.perfilProfesional.findUnique({
      where: { usuarioId },
      include: INCLUDE_VISTA_PROPIA,
    });
    if (!perfil) {
      throw new NotFoundException(PERFIL_NO_ARMADO);
    }
    return mapearPerfilAVistaPropia(perfil);
  }

  /** PR-01 (paso "datos basicos"): upsert lazy, sin importar el rol_activo del usuario. */
  async armarPerfil(usuarioId: string, datos: ArmarPerfil): Promise<PerfilProfesionalVistaPropia> {
    await this.prisma.perfilProfesional.upsert({
      where: { usuarioId },
      create: {
        usuarioId,
        presentacion: datos.presentacion ?? null,
        aniosExperiencia: datos.aniosExperiencia ?? null,
      },
      update: {
        presentacion: datos.presentacion ?? null,
        aniosExperiencia: datos.aniosExperiencia ?? null,
      },
    });
    return this.obtenerPropio(usuarioId);
  }

  /**
   * PR-01 (paso "oficios"): reemplaza el set completo. Un oficio nuevo en
   * una categoria que exige matricula obligatoria (gas, electricidad)
   * arranca en `pendiente`; D9 (docs/dominio.md §12): si la matricula es
   * solo `recomendada` (aire acondicionado) o no se exige, arranca en
   * `no_requerida` y recien pasa a `pendiente` cuando el profesional sube un
   * documento de matricula para ese oficio (VerificacionesService.subirDocumento).
   * Un oficio que ya existia (misma categoria) nunca cambia de categoria via
   * este endpoint, asi que se actualizan solo las subcategorias y su
   * matriculaEstado queda intacto. Un oficio con una Verificacion asociada
   * (Verificacion.oficio es onDelete: Restrict) no se puede borrar: falla
   * todo el request, sin guardado parcial.
   */
  async guardarOficios(
    usuarioId: string,
    datos: GuardarOficios,
  ): Promise<PerfilProfesionalVistaPropia> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);

    const categoriaIds = datos.oficios.map((oficio) => oficio.categoriaId);
    const categorias = await this.prisma.categoria.findMany({
      where: { id: { in: categoriaIds }, activa: true },
    });
    if (categorias.length !== new Set(categoriaIds).size) {
      throw new NotFoundException({
        codigo: "no_encontrado",
        mensaje: "Alguna categoría elegida no existe",
      });
    }
    const categoriaPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));

    await this.prisma.$transaction(async (tx) => {
      const existentes = await tx.oficioProfesional.findMany({ where: { perfilId: perfil.id } });
      const existentePorCategoria = new Map(
        existentes.map((oficio) => [oficio.categoriaId, oficio]),
      );

      const idsABorrar = existentes
        .filter((oficio) => !categoriaIds.includes(oficio.categoriaId))
        .map((oficio) => oficio.id);
      if (idsABorrar.length > 0) {
        const verificacionesAsociadas = await tx.verificacion.count({
          where: { oficioId: { in: idsABorrar } },
        });
        if (verificacionesAsociadas > 0) {
          throw new ConflictException({
            codigo: "conflicto",
            mensaje:
              "No podés quitar un oficio con una verificación de matrícula en curso o resuelta",
          });
        }
        await tx.oficioProfesional.deleteMany({ where: { id: { in: idsABorrar } } });
      }

      for (const oficioInput of datos.oficios) {
        const existente = existentePorCategoria.get(oficioInput.categoriaId);
        if (existente) {
          await tx.oficioProfesional.update({
            where: { id: existente.id },
            data: { subcategorias: oficioInput.subcategorias },
          });
          continue;
        }

        const categoria = categoriaPorId.get(oficioInput.categoriaId);
        if (!categoria) continue; // ya validado arriba, solo para el narrowing de tipos.
        await tx.oficioProfesional.create({
          data: {
            perfilId: perfil.id,
            categoriaId: oficioInput.categoriaId,
            subcategorias: oficioInput.subcategorias,
            matriculaEstado:
              categoria.requiereMatricula === "obligatoria" ? "pendiente" : "no_requerida",
          },
        });
      }
    });

    return this.obtenerPropio(usuarioId);
  }

  /** PR-01 (paso "zona"): upsert de zona_cobertura, unica por perfil. */
  async guardarZona(
    usuarioId: string,
    datos: ZonaCoberturaInput,
  ): Promise<PerfilProfesionalVistaPropia> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);

    if (datos.tipo === "barrios") {
      const barrios = await this.prisma.barrio.findMany({
        where: { id: { in: datos.barrioIds } },
      });
      if (barrios.length !== new Set(datos.barrioIds).size) {
        throw new NotFoundException({
          codigo: "no_encontrado",
          mensaje: "Algún barrio elegido no existe",
        });
      }
    }

    const datosZona =
      datos.tipo === "barrios"
        ? {
            tipo: "barrios" as const,
            barrioIds: datos.barrioIds,
            centroLat: null,
            centroLng: null,
            radioKm: null,
          }
        : {
            tipo: "radio" as const,
            barrioIds: [],
            centroLat: datos.centroLat,
            centroLng: datos.centroLng,
            radioKm: datos.radioKm,
          };

    await this.prisma.zonaCobertura.upsert({
      where: { perfilId: perfil.id },
      create: { perfilId: perfil.id, ...datosZona },
      update: datosZona,
    });

    return this.obtenerPropio(usuarioId);
  }

  /** PR-07: pausar/reanudar el perfil (deja de recibir pedidos coincidentes). */
  async togglePausa(usuarioId: string): Promise<PerfilProfesionalVistaPropia> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);
    await this.prisma.perfilProfesional.update({
      where: { id: perfil.id },
      data: { pausado: !perfil.pausado },
    });
    return this.obtenerPropio(usuarioId);
  }

  private async buscarPerfilOrThrow(usuarioId: string): Promise<PerfilProfesional> {
    const perfil = await this.prisma.perfilProfesional.findUnique({ where: { usuarioId } });
    if (!perfil) {
      throw new NotFoundException(PERFIL_NO_ARMADO);
    }
    return perfil;
  }
}
