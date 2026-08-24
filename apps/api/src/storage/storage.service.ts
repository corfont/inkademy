import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cliente S3 compatible con MinIO (dev) y AWS S3 / Azure Blob / GCS vía
 * interoperabilidad S3 (prod), configurado por S3_ENDPOINT + forcePathStyle.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>("S3_BUCKET", "inkademy-assets");
    this.publicBaseUrl = this.config.get<string>("S3_PUBLIC_BASE_URL");
    this.client = new S3Client({
      endpoint: this.config.get<string>("S3_ENDPOINT"),
      region: this.config.get<string>("S3_REGION", "us-east-1"),
      forcePathStyle: this.config.get<string>("S3_FORCE_PATH_STYLE", "true") === "true",
      credentials: {
        accessKeyId: this.config.get<string>("S3_ACCESS_KEY", ""),
        secretAccessKey: this.config.get<string>("S3_SECRET_KEY", ""),
      },
    });
  }

  async uploadBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.log(`Objeto subido: s3://${this.bucket}/${key}`);
    return key;
  }

  async getSignedUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** Descarga el contenido completo de un objeto (usado para armar el ZIP de certificados en batch). */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    // El SDK v3 tipa Body como un stream genérico; en Node siempre es un Readable real.
    for await (const chunk of result.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /** URL pública directa (para buckets con lectura anónima habilitada, como en dev). */
  getPublicUrl(key: string): string | null {
    if (!this.publicBaseUrl) return null;
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}
