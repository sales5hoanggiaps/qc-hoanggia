import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem infra/.env.example)`);
  return v;
}

/** `endpoint`: dùng cho thao tác server-to-server (CopyObject/DeleteObject/HeadBucket). `publicEndpoint`:
 * dùng khi KÝ url cho trình duyệt — khác `endpoint` khi chạy trong Docker (nội bộ là tên service
 * "minio", nhưng trình duyệt cần địa chỉ/domain thật gọi được). Để trống STORAGE_PUBLIC_ENDPOINT thì
 * dùng luôn STORAGE_ENDPOINT (đúng cho dev chạy `next dev` ngoài Docker, cả 2 đều là localhost). */
export function getStorageConfig() {
  const endpoint = requireEnv("STORAGE_ENDPOINT");
  return {
    endpoint,
    publicEndpoint: process.env.STORAGE_PUBLIC_ENDPOINT || endpoint,
    bucket: requireEnv("STORAGE_BUCKET"),
    accessKeyId: requireEnv("STORAGE_ACCESS_KEY"),
    secretAccessKey: requireEnv("STORAGE_SECRET_KEY"),
  };
}

let cachedClient: S3Client | null = null;
/** Client dùng cho thao tác nội bộ (CopyObject/DeleteObject/HeadBucket/CreateBucket). */
export function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const cfg = getStorageConfig();
  cachedClient = new S3Client({
    endpoint: cfg.endpoint,
    region: "us-east-1", // MinIO không dùng region thật, SDK yêu cầu 1 giá trị bất kỳ
    forcePathStyle: true, // MinIO cần path-style (http://host:port/bucket/key)
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return cachedClient;
}

let cachedPublicClient: S3Client | null = null;
/** Client RIÊNG chỉ dùng để ký presigned URL cho trình duyệt — trỏ `publicEndpoint`. */
export function getPublicS3Client(): S3Client {
  if (cachedPublicClient) return cachedPublicClient;
  const cfg = getStorageConfig();
  cachedPublicClient = new S3Client({
    endpoint: cfg.publicEndpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return cachedPublicClient;
}

let bucketReadyPromise: Promise<void> | null = null;
/** Tạo bucket nếu chưa có — gọi nhiều lần cũng chỉ chạy network call 1 lần (cache promise). */
export function ensureBucketExists(): Promise<void> {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      const client = getS3Client();
      const bucket = getStorageConfig().bucket;
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    })();
  }
  return bucketReadyPromise;
}
