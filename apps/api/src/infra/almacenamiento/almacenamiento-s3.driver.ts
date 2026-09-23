import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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
 */
@Injectable()
export class AlmacenamientoS3Driver implements ProveedorAlmacenamiento {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(configService: ConfigService<Env, true>) {
    this.bucket = configService.get("S3_BUCKET", { infer: true }) ?? "";
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
}
