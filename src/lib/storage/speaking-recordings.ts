import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const PREFIX = "private/speaking/";
let client: S3Client | undefined;

function config() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    if (process.env.NODE_ENV === "production") throw new Error("Private recording storage is not configured");
    return null;
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

export function assertSpeakingStorageReady() {
  config();
}

function localPath(key: string) {
  return path.join(process.cwd(), ".private-media", key);
}

function assertKey(key: string) {
  if (!/^private\/speaking\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(user|partner)\.(wav|mp3)$/.test(key)) {
    throw new Error("Invalid recording key");
  }
}

export function recordingKey(sessionId: string, assetId: string, kind: "user" | "partner", extension: "wav" | "mp3") {
  const key = `${PREFIX}${sessionId}/${assetId}/${kind}.${extension}`;
  assertKey(key);
  return key;
}

export async function putRecording(key: string, body: Buffer, mimeType: string) {
  assertKey(key);
  const remote = config();
  if (remote) {
    await remote.client.send(new PutObjectCommand({ Bucket: remote.bucket, Key: key, Body: body, ContentType: mimeType }));
  } else {
    const target = localPath(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, body, { mode: 0o600 });
  }
}

export async function getRecording(key: string): Promise<Buffer> {
  assertKey(key);
  const remote = config();
  if (remote) {
    const result = await remote.client.send(new GetObjectCommand({ Bucket: remote.bucket, Key: key }));
    if (!result.Body) throw new Error("Recording missing");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  return readFile(localPath(key));
}

export async function deleteRecording(key: string) {
  assertKey(key);
  const remote = config();
  if (remote) {
    await remote.client.send(new DeleteObjectCommand({ Bucket: remote.bucket, Key: key }));
  } else {
    await rm(localPath(key), { force: true });
  }
}
