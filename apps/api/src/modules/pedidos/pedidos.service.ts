import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type {
  CrearPedido,
  EditarPedido,
  EstadoPedido,
  PedidoResumenVista,
  PedidoVista,
  RespuestasGuia,
} from "@fixeo/shared";
import { detectarDatosDeContacto } from "@fixeo/shared";
import { Prisma } from "../../generated/prisma/client.js";
import type { Categoria } from "../../generated/prisma/client.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  PROVEEDOR_ALMACENAMIENTO,
  type ProveedorAlmacenamiento,
} from "../../infra/almacenamiento/proveedor-almacenamiento.js";
import {
  COLA_AVISO_MATCHING,
  type AvisoMatchingJobData,
} from "../../infra/queue/colas.constants.js";
import { clavePedidoFotoBorrador } from "../archivos/claves-almacenamiento.js";
import { EventosService } from "../eventos/eventos.service.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import { transicionar } from "./pedidos.estados.js";
import { mapearPedidoAResumenVista, mapearPedidoAVista } from "./pedidos.vistas.js";
import type { PedidoConRelaciones } from "./pedidos.vistas.js";

// docs/dominio.md §5: cuentan para el cupo de pedidos activos por cliente.
// `borrador` no esta porque este slice nunca persiste un Pedido en ese
// estado (decision del slice: el asistente vive 100% en el cliente).
const ESTADOS_ACTIVOS_CLIENTE: EstadoPedido[] = [
  "en_revision",
  "publicado",
  "con_postulaciones",
  "contacto_habilitado",
];

const INCLUDE_VISTA_COMPLETA = {
  categoria: true,
  direccion: true,
  barrio: true,
  fotos: true,
} as const;

@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
    @Inject(PROVEEDOR_ALMACENAMIENTO) private readonly almacenamiento: ProveedorAlmacenamiento,
    private readonly eventos: EventosService,
    @InjectQueue(COLA_AVISO_MATCHING)
    private readonly colaAvisoMatching: Queue<AvisoMatchingJobData>,
  ) {}

  async crear(usuarioId: string, datos: CrearPedido): Promise<PedidoVista> {
    await this.validarLongitudDescripcion(datos.descripcion);

    const fotosMax = await this.parametros.getNumero("fotos_max");
    if (datos.fotos.length > fotosMax) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: `Podés subir como máximo ${fotosMax} fotos`,
      });
    }
    // El cliente solo manda ids: la url la recalculamos nosotros a partir del
    // borradorId y confirmamos contra el storage que el archivo existe de
    // verdad, para que no se pueda asociar una foto ajena ni una url
    // inventada a un pedido (ver decision del slice sobre subida anonima).
    const fotosVerificadas = await this.verificarFotos(datos.borradorId, datos.fotos);

    const categoria = await this.prisma.categoria.findUnique({
      where: { id: datos.categoriaId },
    });
    if (!categoria || !categoria.activa) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "La categoria no existe" });
    }
    this.validarSubcategoriaYPreguntasGuia(categoria, datos.subcategoria, datos.respuestasGuia);

    const barrio = await this.prisma.barrio.findUnique({
      where: { id: datos.direccion.barrioId },
    });
    if (!barrio) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El barrio no existe" });
    }

    const [maxActivos, vigenciaDias] = await Promise.all([
      this.parametros.getNumero("pedidos_activos_max_por_cliente"),
      this.parametros.getNumero("pedido_vigencia_dias"),
    ]);

    // Controles automaticos (docs/dominio.md §3): datos de contacto en el
    // texto (descripcion, subcategoria y respuestas guia: cualquier texto
    // libre que despues se le muestre a un profesional) y duplicado exacto
    // del mismo cliente. "Contenido fuera de catalogo" no se implementa en
    // este slice (sin subcategorias/keywords sembradas, daria demasiados
    // falsos positivos).
    const contactoDetectado = this.hayDatosDeContacto(
      datos.descripcion,
      datos.subcategoria,
      datos.respuestasGuia,
    );
    const descripcionNormalizada = normalizarDescripcion(datos.descripcion);

    let pedidoCreado;
    try {
      pedidoCreado = await this.prisma.$transaction(async (tx) => {
        // Lock sobre el cliente: serializa publicaciones concurrentes del
        // mismo usuario para que el conteo de "pedidos activos" (cupo) sea
        // consistente (CLAUDE.md, regla no negociable #4).
        await tx.$queryRaw`SELECT id FROM usuario WHERE id = ${usuarioId} FOR UPDATE`;

        const activos = await tx.pedido.findMany({
          where: { clienteId: usuarioId, estado: { in: ESTADOS_ACTIVOS_CLIENTE } },
          select: { descripcion: true },
        });

        if (activos.length >= maxActivos) {
          throw new ConflictException({
            codigo: "limite_excedido",
            mensaje: `Ya tenés ${maxActivos} pedidos activos. Cerrá o cancelá alguno antes de publicar otro`,
          });
        }

        const esDuplicado = activos.some(
          (pedido) => normalizarDescripcion(pedido.descripcion) === descripcionNormalizada,
        );

        // D1 (docs/dominio.md §12): categoria "Otro" o un control automatico
        // mandan el pedido a revision en vez de publicarlo directamente.
        const enRevision = categoria.slug === "otro" || contactoDetectado || esDuplicado;
        const ahora = new Date();

        // Direccion siempre nueva (todavia no existe "mis direcciones
        // guardadas"): se crea aparte para poder pasar el resto de los campos
        // de Pedido por FK escalar (clienteId, categoriaId, barrioId), sin
        // mezclar el estilo "unchecked" (FKs escalares) con el estilo
        // "checked" (relaciones anidadas) en un mismo create, que Prisma no
        // permite combinar.
        const direccionCreada = await tx.direccion.create({
          data: {
            calle: datos.direccion.calle,
            numero: datos.direccion.numero,
            piso: datos.direccion.piso ?? null,
            depto: datos.direccion.depto ?? null,
            tipoPropiedad: datos.direccion.tipoPropiedad,
            barrioId: datos.direccion.barrioId,
            lat: datos.direccion.lat,
            lng: datos.direccion.lng,
          },
        });

        try {
          return await tx.pedido.create({
            data: {
              clienteId: usuarioId,
              categoriaId: datos.categoriaId,
              subcategoria: datos.subcategoria ?? null,
              descripcion: datos.descripcion,
              respuestasGuia:
                datos.respuestasGuia === undefined
                  ? undefined
                  : (datos.respuestasGuia as Prisma.InputJsonValue),
              urgencia: datos.urgencia,
              franjas: datos.franjas,
              direccionId: direccionCreada.id,
              barrioId: datos.direccion.barrioId,
              lat: datos.direccion.lat,
              lng: datos.direccion.lng,
              estado: enRevision ? "en_revision" : "publicado",
              // D1: publicadoEn/expiraEn se fijan recien cuando el pedido queda
              // publicado, para que la revision no le coma dias de vigencia.
              publicadoEn: enRevision ? null : ahora,
              expiraEn: enRevision
                ? null
                : new Date(ahora.getTime() + vigenciaDias * 24 * 60 * 60 * 1000),
              fotos: {
                create: fotosVerificadas.map((foto, indice) => ({
                  id: foto.id,
                  url: foto.url,
                  orden: indice,
                })),
              },
            },
            include: INCLUDE_VISTA_COMPLETA,
          });
        } catch (error) {
          // Defensa en profundidad detras del chequeo previo de verificarFotos:
          // dos POST concurrentes con el mismo id de foto (mismo cliente
          // reintentando, o la url publica de una foto ya publicada) pueden
          // pasar ese chequeo los dos y competir por la misma PK de
          // foto_pedido. La constraint de la base es la unica fuente de verdad
          // realmente atomica; sin este catch, esto cae como error interno.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new BadRequestException({
              codigo: "validacion",
              mensaje: "Una o más fotos no se encontraron, volvé a subirlas",
            });
          }
          throw error;
        }
      });
    } catch (error) {
      // El evento se registra fuera de la transaccion que lo genero (si
      // fuera adentro, se revertiria junto con el resto al hacer throw): es
      // un registro de analitica, no algo que tenga que ser atomico con el
      // intento de publicar. Solo el cupo lanza ConflictException adentro de
      // este bloque, asi que no hace falta inspeccionar el codigo del error.
      if (error instanceof ConflictException) {
        await this.registrarEventoSeguro({
          tipo: "limite_alcanzado",
          categoria: categoria.slug,
          zona: barrio.nombre,
          rol: "cliente",
          usuarioId,
        });
      }
      throw error;
    }

    // docs/dominio.md §10: evento del mismo cambio que la accion. Solo cuando
    // el pedido queda publicado de una: en_revision todavia no es una
    // publicacion real (D1: recien lo es si el moderador lo aprueba). Ese otro
    // camino (en_revision -> publicado) vive en
    // PedidosModeracionService.resolverEnRevision (AD-02, slice 9), que
    // registra el mismo evento y encola el mismo aviso de matching.
    if (pedidoCreado.estado === "publicado") {
      await this.registrarEventoSeguro({
        tipo: "pedido_publicado",
        categoria: categoria.slug,
        zona: barrio.nombre,
        rol: "cliente",
        usuarioId,
        pedidoId: pedidoCreado.id,
      });
      // Slice 5 (docs/dominio.md §6): calcula coincidentes y avisa a los
      // primeros `notificados_iniciales`. Encolado, no en linea: el matching
      // hace una consulta geoespacial que no tiene por que demorar la
      // respuesta de "pedido creado".
      await this.encolarAvisoMatchingSeguro(pedidoCreado.id);
    }

    return this.mapearAVistaConCupo(pedidoCreado);
  }

  /**
   * La analitica nunca puede tumbar una accion de negocio ya resuelta: si el
   * pedido se creo (o el cupo genuinamente se supero), un error al escribir
   * evento_analitico no debe convertirse en un 500 que le haga creer al
   * cliente que la accion fallo cuando en realidad no fallo.
   */
  private async registrarEventoSeguro(
    datos: Parameters<EventosService["registrar"]>[0],
  ): Promise<void> {
    try {
      await this.eventos.registrar(datos);
    } catch (error) {
      this.logger.warn(`No se pudo registrar el evento "${datos.tipo}": ${String(error)}`);
    }
  }

  /** Mismo criterio que registrarEventoSeguro: el pedido ya existe, no encolar el aviso no puede tumbar la respuesta. */
  private async encolarAvisoMatchingSeguro(pedidoId: string): Promise<void> {
    try {
      await this.colaAvisoMatching.add("aviso-matching", { pedidoId });
    } catch (error) {
      this.logger.warn(`No se pudo encolar el aviso de matching: ${String(error)}`);
    }
  }

  /**
   * CL-07/CL-08 (revision de codigo del slice 6): calcula los mismos 3 campos
   * de cupo que ya expone PedidoVistaProfesional (PR-03), para que el dueno
   * del pedido nunca vea un numero inventado ni desincronizado de
   * `postulaciones_max_por_pedido` / `seleccionables_max_por_pedido`.
   */
  private async mapearAVistaConCupo(pedido: PedidoConRelaciones): Promise<PedidoVista> {
    const [seleccionablesMax, postulacionesMax] = await Promise.all([
      this.parametros.getNumero("seleccionables_max_por_pedido"),
      this.parametros.getNumero("postulaciones_max_por_pedido"),
    ]);
    return mapearPedidoAVista(pedido, {
      postulacionesCupoLleno: pedido.cantidadPostulaciones >= postulacionesMax,
      cantidadContactos: pedido.cantidadContactos,
      // Math.max(0, ...): si durante el piloto se baja seleccionables_max_por_pedido
      // por debajo de la cantidad de contactos que ya tiene un pedido viejo,
      // esto no puede dar negativo (revision de codigo del slice 6).
      seleccionablesLibres: Math.max(0, seleccionablesMax - pedido.cantidadContactos),
    });
  }

  async listarPropios(usuarioId: string): Promise<PedidoResumenVista[]> {
    const pedidos = await this.prisma.pedido.findMany({
      where: { clienteId: usuarioId, estado: { in: ESTADOS_ACTIVOS_CLIENTE } },
      include: { categoria: { select: { nombre: true, slug: true } } },
      orderBy: { creadoEn: "desc" },
    });
    return pedidos.map(mapearPedidoAResumenVista);
  }

  async obtenerPropio(usuarioId: string, pedidoId: string): Promise<PedidoVista> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: INCLUDE_VISTA_COMPLETA,
    });
    // 404 en ambos casos (no existe / no es del usuario): no revela si el
    // pedido existe cuando es de otro cliente.
    if (!pedido || pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }
    return this.mapearAVistaConCupo(pedido);
  }

  // Nota para el slice de matching/feed (§6): esto permite subir `urgencia` a
  // `emergencia` despues de publicar, cuando el aviso inicial a los 30
  // profesionales ya salio con el radio y la urgencia viejos. Ese slice tiene
  // que decidir si re-notifica o si conviene congelar `urgencia` en la
  // edicion; no es una decision de este slice.
  async editar(usuarioId: string, pedidoId: string, datos: EditarPedido): Promise<PedidoVista> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { categoria: true },
    });
    if (!pedido || pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    await this.validarLongitudDescripcion(datos.descripcion);
    this.validarSubcategoriaYPreguntasGuia(
      pedido.categoria,
      datos.subcategoria,
      datos.respuestasGuia,
    );

    // A diferencia de crear(), donde un control automatico manda el pedido a
    // en_revision sin rechazarlo (para no perder toda la publicacion), aca el
    // cliente esta editando en el momento y puede corregir el texto al toque:
    // se rechaza la edicion en vez de sacar de circulacion un pedido que ya
    // estaba publicado y aprobado.
    if (this.hayDatosDeContacto(datos.descripcion, datos.subcategoria, datos.respuestasGuia)) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "Revisá el texto: parece tener un teléfono, email o usuario de redes",
      });
    }

    // docs/dominio.md §3: "el pedido solo se edita hasta la primera
    // postulacion". El where condicional (igual que transicionar()) cierra
    // la ventana entre este chequeo y la escritura: si llega una postulacion
    // o el estado cambia mientras tanto, count da 0 y se informa conflicto en
    // vez de editar un pedido que ya dejo de ser editable.
    const resultado = await this.prisma.pedido.updateMany({
      where: { id: pedidoId, estado: "publicado", cantidadPostulaciones: 0 },
      data: {
        subcategoria: datos.subcategoria ?? null,
        descripcion: datos.descripcion,
        // A diferencia de crear() (un create, donde omitir el campo ya deja
        // la columna en NULL), esto es un update: `undefined` le dice a
        // Prisma "no toques esta columna", no "vaciala". EditarPedidoPage
        // siempre manda el estado completo de las respuestas (no un patch
        // parcial), asi que su ausencia significa "las borraron todas" y hay
        // que escribir NULL de verdad con `Prisma.JsonNull`.
        respuestasGuia:
          datos.respuestasGuia === undefined
            ? Prisma.JsonNull
            : (datos.respuestasGuia as Prisma.InputJsonValue),
        urgencia: datos.urgencia,
        franjas: datos.franjas,
      },
    });
    if (resultado.count === 0) {
      throw new ConflictException({
        codigo: "conflicto",
        mensaje: "Este pedido ya no se puede editar",
      });
    }

    const actualizado = await this.prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: INCLUDE_VISTA_COMPLETA,
    });
    return this.mapearAVistaConCupo(actualizado);
  }

  async cancelar(usuarioId: string, pedidoId: string): Promise<PedidoVista> {
    const pedido = await this.prisma.pedido.findUnique({ where: { id: pedidoId } });
    if (!pedido || pedido.clienteId !== usuarioId) {
      throw new NotFoundException({ codigo: "no_encontrado", mensaje: "El pedido no existe" });
    }

    // D5/D12 (docs/dominio.md §12): el cliente cancela desde publicado,
    // con_postulaciones o en_revision; transicionar() rechaza cualquier otro origen.
    await this.prisma.$transaction((tx) => transicionar(tx, pedido.id, pedido.estado, "cancelado"));

    const actualizado = await this.prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: INCLUDE_VISTA_COMPLETA,
    });
    return this.mapearAVistaConCupo(actualizado);
  }

  private async verificarFotos(
    borradorId: string,
    fotos: CrearPedido["fotos"],
  ): Promise<{ id: string; url: string }[]> {
    if (fotos.length === 0) return [];

    // El id de foto lo elige el cliente (el que genero el borrador) y es la
    // PK de foto_pedido: si ya esta tomado (reintento tras un timeout, o un
    // segundo POST con la url publica de una foto ya publicada, que revela
    // el mismo id) el create de mas abajo rompe la PK y cae como error
    // interno en vez de un 400. Se rechaza antes de tocar storage.
    const yaTomadas = await this.prisma.fotoPedido.findMany({
      where: { id: { in: fotos.map((foto) => foto.id) } },
      select: { id: true },
    });
    if (yaTomadas.length > 0) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "Una o más fotos no se encontraron, volvé a subirlas",
      });
    }

    return Promise.all(
      fotos.map(async (foto) => {
        const key = clavePedidoFotoBorrador(borradorId, foto.id);
        const existe = await this.almacenamiento.existe(key);
        if (!existe) {
          throw new BadRequestException({
            codigo: "validacion",
            mensaje: "Una o más fotos no se encontraron, volvé a subirlas",
          });
        }
        return { id: foto.id, url: this.almacenamiento.urlPara(key) };
      }),
    );
  }

  private async validarLongitudDescripcion(descripcion: string): Promise<void> {
    const [min, max] = await Promise.all([
      this.parametros.getNumero("descripcion_min"),
      this.parametros.getNumero("descripcion_max"),
    ]);
    if (descripcion.length < min || descripcion.length > max) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: `La descripcion debe tener entre ${min} y ${max} caracteres`,
      });
    }
  }

  /** CL-03: subcategoria y respuestas guia son texto libre, pero tienen que corresponder a la categoria elegida. */
  private validarSubcategoriaYPreguntasGuia(
    categoria: Categoria,
    subcategoria: string | undefined,
    respuestasGuia: RespuestasGuia,
  ): void {
    if (subcategoria && !categoria.subcategorias.includes(subcategoria)) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "La subcategoría no corresponde a la categoría elegida",
      });
    }
    if (!respuestasGuia) return;
    const preguntasValidas = new Set(categoria.preguntasGuia);
    const algunaInvalida = Object.keys(respuestasGuia).some(
      (pregunta) => !preguntasValidas.has(pregunta),
    );
    if (algunaInvalida) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "Alguna respuesta no corresponde a una pregunta guía de la categoría",
      });
    }
  }

  /**
   * Datos de contacto en cualquier texto libre que se guarda del pedido, no
   * solo la descripcion: subcategoria y respuestas guia tambien son texto
   * libre y en slices futuros se le muestran al profesional (docs/dominio.md
   * §3, regla no negociable #6).
   */
  private hayDatosDeContacto(
    descripcion: string,
    subcategoria: string | undefined,
    respuestasGuia: RespuestasGuia,
  ): boolean {
    const textos = [descripcion, subcategoria, ...Object.values(respuestasGuia ?? {})];
    return textos.some(
      (texto) => typeof texto === "string" && detectarDatosDeContacto(texto).detectado,
    );
  }
}

/** trim() + espacios repetidos colapsados, para comparar duplicados exactos "de verdad". */
function normalizarDescripcion(texto: string): string {
  return texto.trim().replace(/\s+/g, " ");
}
