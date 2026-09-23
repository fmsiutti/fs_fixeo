import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema.js";
import type {
  ProveedorAlmacenamiento,
  ResultadoAlmacenamiento,
} from "./proveedor-almacenamiento.js";

/**
 * Driver real: sube a un bucket S3-compatible (S3 o R2). No se ejercita en
 * tests (requiere credenciales reales, igual que TwilioRealDriver), pero
 * debe compilar y tener la forma correcta segun el SDK.
 *
 * `resolverBucket` es un metodo (no una constante) para que
 * AlmacenamientoDocumentosS3Driver pueda apuntar a un bucket distinto sin
 * duplicar el resto de la clase (cliente S3, firma de URLs, etc.).
 */
@Injectable()
export class AlmacenamientoS3Driver implements ProveedorAlmacenamiento {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(configService: ConfigService<Env, true>) {
    this.bucket = this.resolverBucket(configService);
    this.endpoint = configService.get("S3_ENDPOINT", { infer: true }) ?? "";
    this.client = new S3Client({
      region: configService.get("S3_REGION", { infer: true }) ?? "us-east-1",
      endpoint: this.endpoint || undefined,
      credentials: {
        accessKeyId: configService.get("S3_ACCESS_KEY_ID", { infer: true }) ?? "",
        secretAccessKey: configService.get("S3_SECRET_ACCESS_KEY", { infer: true }) ?? "",
      },
    });
  }

  protected resolverBucket(configService: ConfigService<Env, true>): string {
    return configService.get("S3_BUCKET", { infer: true }) ?? "";
  }

  async guardar(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<ResultadoAlmacenamiento> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // Cifrado en reposo (CLAUDE.md §9, "documentos de verificacion
        // cifrados"). No hace daño aplicarlo tambien al bucket de fotos.
        ServerSideEncryption: "AES256",
      }),
    );
    return { url: this.urlPara(key) };
  }

  async eliminar(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async existe(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof NotFound) return false;
      throw error;
    }
  }

  urlPara(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async contar(prefijo: string): Promise<number> {
    const respuesta = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefijo }),
    );
    return respuesta.KeyCount ?? 0;
  }

  async urlFirmada(key: string, ttlSegundos: number): Promise<string> {
    const comando = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, comando, { expiresIn: ttlSegundos });
  }
}

/**
 * Variante de AlmacenamientoS3Driver para documentos de verificacion: sube
 * al bucket de S3_BUCKET_DOCUMENTOS en vez de S3_BUCKET. Ese bucket real
 * (fuera del repo) tiene que configurarse sin lectura publica: el codigo
 * solo puede evitar servirlo como si lo fuera (nunca se arma una URL
 * publica de este bucket, solo `urlFirmada`), no puede forzar la ACL del
 * bucket en si.
 */
@Injectable()
export class AlmacenamientoDocumentosS3Driver extends AlmacenamientoS3Driver {
  protected override resolverBucket(configService: ConfigService<Env, true>): string {
    return configService.get("S3_BUCKET_DOCUMENTOS", { infer: true }) ?? "";
  }
}
