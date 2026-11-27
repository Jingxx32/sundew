import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getPrivateMediaUrl } from "@/lib/storage/r2";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Fetches a presigned URL server-side so the model never has to. null on any failure. */
async function inlineRemoteImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error("image too large");
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("image too large");
    const fromExt = MIME[path.extname(new URL(url).pathname).toLowerCase()];
    const fromType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const mime = fromExt ?? (fromType && Object.values(MIME).includes(fromType) ? fromType : undefined);
    if (!mime) throw new Error("unknown image type");
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch (err) {
    console.error("Tutor question image could not be inlined", err);
    return null;
  }
}

/**
 * An inline `data:` URL for the question image. With R2 the signed URL is fetched here; without it
 * (development) the file is read from `public/`. null when the file is missing, unreadable or not an image.
 */
export async function questionImageInput(imagePath: string): Promise<string | null> {
  const url = await getPrivateMediaUrl(imagePath);
  if (/^https?:\/\//i.test(url)) return inlineRemoteImage(url);
  if (!url.startsWith("/")) return null;
  const file = path.resolve(PUBLIC_DIR, `.${url}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null;
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) return null;
  try {
    return `data:${mime};base64,${(await readFile(file)).toString("base64")}`;
  } catch {
    return null;
  }
}
