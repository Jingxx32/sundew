import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MEDIA_PREFIX = "/media/";
const SIGNED_URL_TTL_SECONDS = 15 * 60;

let client: S3Client | undefined;

function r2Config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function mediaObjectKey(mediaPath: string): string {
  if (!mediaPath.startsWith(MEDIA_PREFIX) || mediaPath.includes("..")) {
    throw new Error("Invalid media path.");
  }

  return mediaPath.slice(1);
}

function getClient(config: NonNullable<ReturnType<typeof r2Config>>): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

/**
 * Creates a short-lived URL for a private R2 object. The browser receives no
 * long-lived R2 credentials, and the bucket remains inaccessible by default.
 */
export async function getPrivateMediaUrl(mediaPath: string): Promise<string> {
  const config = r2Config();
  if (!config) {
    if (process.env.NODE_ENV !== "production") return mediaPath;
    throw new Error("Cloudflare R2 media storage is not configured.");
  }

  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: mediaObjectKey(mediaPath) }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}
