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

/**
 * An image the model can fetch or decode. With R2 this is a signed URL. Without it (development) the file
 * is read from `public/` and inlined as a data URL. null when the file is missing, unreadable or not an image.
 */
export async function questionImageInput(imagePath: string): Promise<string | null> {
  const url = await getPrivateMediaUrl(imagePath);
  if (!url.startsWith("/")) return url;
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
