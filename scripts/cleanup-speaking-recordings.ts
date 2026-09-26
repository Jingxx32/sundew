/** Dry-run by default. Use --apply --expect-host=<database host> in the private environment. */
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import path from "node:path";
import { rm } from "node:fs/promises";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const databaseHost = new URL(databaseUrl).hostname;
const apply = process.argv.includes("--apply");
const expectedHost = process.argv.find((arg) => arg.startsWith("--expect-host="))?.slice(14);
if (apply && expectedHost !== databaseHost) throw new Error("Supply --expect-host matching the target database host");

const sql = postgres(databaseUrl, { max: 1 });
try {
  const expired = await sql<{ id: string; object_key: string }[]>`
    select id, object_key from speaking_assets
    where expires_at <= now() and deleted_at is null
    order by expires_at limit 100
  `;
  console.log(`${apply ? "Deleting" : "Would delete"} ${expired.length} expired speaking recordings from ${databaseHost}`);
  if (apply) {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    const bucket = process.env.CLOUDFLARE_R2_BUCKET;
    const remote = accountId && accessKeyId && secretAccessKey && bucket
      ? new S3Client({ region: "auto", endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } })
      : null;
    if (!remote && !["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
      throw new Error("Private R2 storage is required for a non-local database");
    }
    for (const asset of expired) {
      if (!/^private\/speaking\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(user|partner)\.(wav|mp3)$/.test(asset.object_key)) throw new Error("Unexpected object key");
      if (remote) await remote.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.object_key }));
      else await rm(path.join(process.cwd(), ".private-media", asset.object_key), { force: true });
      await sql`update speaking_assets set deleted_at = now() where id = ${asset.id} and deleted_at is null`;
    }
  }
} finally {
  await sql.end();
}
