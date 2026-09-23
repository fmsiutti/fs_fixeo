import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import sharp from "sharp";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import {
  PROVEEDOR_ALMACENAMIENTO,
  type ProveedorAlmacenamiento,
} from "../../infra/almacenamiento/proveedor-almacenamiento.js";
import { ParametrosService } from "../parametros/parametros.service.js";
import { clavePedidoFotoBorrador, prefijoBorrador } from "./claves-almacenamiento.js";

const LADO_MAXIMO_PX = 1600;
const CALIDAD_JPEG = 80;

export interface FotoSubida {
  id: string;
  url: string;
}

@Injectable()
export class ArchivosService {
  constructor(
    @Inject(PROVEEDOR_ALMACENAMIENTO) private readonly almacenamiento: ProveedorAlmacenamiento,
    private readonly parametros: ParametrosService,
    private readonly prisma: PrismaService,
  ) {}

  async subirFotoBorrador(borradorId: string, archivo: Express.Multer.File): Promise<FotoSubida> {
    // Sin esto, un mismo borradorId (nunca autenticado) podria subir fotos sin
    // techo aunque el publish final solo vaya a usar fotos_max: el storage se
    // llenaria igual antes de llegar a publicar.
    const fotosMax = await this.parametros.getNumero("fotos_max");
    const yaSubidas = await this.almacenamiento.contar(prefijoBorrador(borradorId));
    if (yaSubidas >= fotosMax) {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: `Ya subiste el máximo de ${fotosMax} fotos para este pedido`,
      });
    }

    const fotoId = randomUUID();

    let buffer: Buffer;
    try {
      // sharp() no preserva metadatos EXIF a menos que se llame a
      // .withMetadata() explicitamente: al re-codificar se descartan (CLAUDE.md
      // §9, "fotos sin metadatos de ubicacion"). .rotate() sin argumentos aplica
      // la orientacion EXIF antes de perderla, para que la foto no quede girada.
      buffer = await sharp(archivo.buffer)
        .rotate()
        .resize({
          width: LADO_MAXIMO_PX,
          height: LADO_MAXIMO_PX,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: CALIDAD_JPEG })
        .toBuffer();
    } catch {
      throw new BadRequestException({
        codigo: "validacion",
        mensaje: "La imagen no se pudo procesar",
      });
    }

    const { url } = await this.almacenamiento.guardar(
      buffer,
      clavePedidoFotoBorrador(borradorId, fotoId),
      "image/jpeg",
    );
    return { id: fotoId, url };
  }

  async eliminarFotoBorrador(borradorId: string, fotoId: string): Promise<void> {
    // La key de storage de una foto de borrador (borradores/{borradorId}/{id})
    // es la misma que queda public en la url de la foto ya publicada
    // (pedidoVista.fotos[].url, ver pedidos.service.ts): cualquiera con esa
    // url conoce ambos ids. Si el id ya pertenece a un pedido publicado, este
    // endpoint (pensado solo para el asistente, sin sesion) no toca el
    // archivo: se comporta como si ya no existiera, igual que un id que nunca
    // se subio.
    const yaPublicada = await this.prisma.fotoPedido.findUnique({
      where: { id: fotoId },
      select: { id: true },
    });
    if (yaPublicada) return;

    await this.almacenamiento.eliminar(clavePedidoFotoBorrador(borradorId, fotoId));
  }
}
