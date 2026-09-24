import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  ArmarPerfil,
  CrearPlantillaMensaje,
  GuardarOficios,
  PerfilProfesionalVistaPropia,
  PerfilProfesionalVistaPublica,
  PlantillaMensajeVista,
  ZonaCoberturaInput,
} from "@fixeo/shared";
import { PLANTILLAS_MENSAJE_MAX_POR_PERFIL } from "@fixeo/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { PerfilProfesional, Usuario } from "../../generated/prisma/client.js";
import { EventosService } from "../eventos/eventos.service.js";
import { mapearPerfilAVistaPropia, mapearPerfilAVistaPublica } from "./profesionales.vistas.js";

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
  private readonly logger = new Logger(ProfesionalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventosService,
  ) {}

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

  /**
   * CL-09: perfil publico, visible por cualquier usuario autenticado (no solo
   * el cliente que evalua postulaciones). `usuario` es quien mira, para
   * registrar el evento con su rol activo real.
   */
  async obtenerPerfilPublico(
    usuario: Usuario,
    perfilId: string,
  ): Promise<PerfilProfesionalVistaPublica> {
    const perfil = await this.prisma.perfilProfesional.findUnique({
      where: { id: perfilId },
      include: {
        usuario: { select: { nombre: true, apellido: true, fotoUrl: true } },
        oficios: { include: { categoria: true }, orderBy: { creadoEn: "asc" } },
        zonaCobertura: true,
      },
    });
    if (!perfil) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El perfil no existe" });
    }

    // Importante 3 (revision de codigo del slice 6): CL-09 se puede abrir
    // desde varios lugares (feed, un pedido puntual, un link directo), sin un
    // contexto real de categoria/zona en este endpoint. Antes se usaba el
    // slug del primer oficio del perfil como "categoria", pero eso no tiene
    // relacion real con la visita (podria ser un cliente mirando el perfil
    // por su oficio de plomeria y el perfil tener 3 oficios mas). Regla no
    // negociable #8 pide categoria/zona/rol, pero no obliga a inventar una
    // categoria falsa: se registran en null, igual que otros eventos sin
    // contexto suficiente en este proyecto.
    await this.registrarEventoSeguro({
      tipo: "perfil_profesional_visto",
      categoria: null,
      zona: null,
      rol: usuario.rolActivo,
      usuarioId: usuario.id,
    });

    return mapearPerfilAVistaPublica(perfil);
  }

  /** PR-04/PR-07: plantillas de mensaje propias, mas recientes primero. */
  async listarPlantillas(usuarioId: string): Promise<PlantillaMensajeVista[]> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);
    const plantillas = await this.prisma.plantillaMensaje.findMany({
      where: { perfilId: perfil.id },
      orderBy: { creadoEn: "desc" },
    });
    return plantillas.map((plantilla) => ({
      id: plantilla.id,
      texto: plantilla.texto,
      creadoEn: plantilla.creadoEn.toISOString(),
    }));
  }

  async crearPlantilla(
    usuarioId: string,
    datos: CrearPlantillaMensaje,
  ): Promise<PlantillaMensajeVista> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);

    const cantidad = await this.prisma.plantillaMensaje.count({ where: { perfilId: perfil.id } });
    if (cantidad >= PLANTILLAS_MENSAJE_MAX_POR_PERFIL) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: `Ya tenés el máximo de ${PLANTILLAS_MENSAJE_MAX_POR_PERFIL} plantillas`,
      });
    }

    const plantilla = await this.prisma.plantillaMensaje.create({
      data: { perfilId: perfil.id, texto: datos.texto },
    });
    return { id: plantilla.id, texto: plantilla.texto, creadoEn: plantilla.creadoEn.toISOString() };
  }

  async borrarPlantilla(usuarioId: string, plantillaId: string): Promise<void> {
    const perfil = await this.buscarPerfilOrThrow(usuarioId);
    const plantilla = await this.prisma.plantillaMensaje.findUnique({
      where: { id: plantillaId },
    });
    if (!plantilla || plantilla.perfilId !== perfil.id) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La plantilla no existe" });
    }
    await this.prisma.plantillaMensaje.delete({ where: { id: plantillaId } });
  }

  /** La analitica nunca puede tumbar una accion de negocio ya resuelta (mismo criterio que PedidosService). */
  private async registrarEventoSeguro(
    datos: Parameters<EventosService["registrar"]>[0],
  ): Promise<void> {
    try {
      await this.eventos.registrar(datos);
    } catch (error) {
      this.logger.warn(`No se pudo registrar el evento "${datos.tipo}": ${String(error)}`);
    }
  }

  private async buscarPerfilOrThrow(usuarioId: string): Promise<PerfilProfesional> {
    const perfil = await this.prisma.perfilProfesional.findUnique({ where: { usuarioId } });
    if (!perfil) {
      throw new NotFoundException(PERFIL_NO_ARMADO);
    }
    return perfil;
  }
}
