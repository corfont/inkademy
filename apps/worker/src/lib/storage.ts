import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Cliente S3-compatible. En dev apunta a MinIO; en prod a S3/Azure Blob/GCS
// (interfaz S3) sin cambiar código — ver docs/DEPLOYMENT.md.
let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
  });
  return client;
}

export interface UploadResult {
  /** Se guarda como "assetId" en los modelos (Certificate.pdfAssetId, etc). */
  assetId: string;
  publicUrl: string;
}

export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const bucket = process.env.S3_BUCKET ?? "inkademy-assets";
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const base = process.env.S3_PUBLIC_BASE_URL ?? `${process.env.S3_ENDPOINT}/${bucket}`;
  return {
    assetId: key,
    publicUrl: `${base.replace(/\/$/, "")}/${key}`,
  };
}
