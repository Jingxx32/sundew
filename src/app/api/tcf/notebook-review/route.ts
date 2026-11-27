import { z } from "zod";
import { requireFeature } from "@/lib/access/guard";
import { generateNotebookReview } from "@/lib/actions/tcf-notebook";
import { AuthenticationError, authErrorStatus } from "@/lib/auth/session";
import { UserFacingError } from "@/lib/user-error";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  noteIds: z.array(z.string().uuid()).min(1).max(15),
});

/**
 * Notebook review items for one session. A route, not a server action: Next runs server
 * actions one at a time, so a slow AI batch would hold up every word grade queued behind it.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });

  try {
    await requireFeature("tcf");
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ code: error.code }, { status: authErrorStatus(error.code) });
    throw error;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  try {
    // Re-checks access and the AI budget; a generation failure already comes back as all-null.
    const items = await generateNotebookReview(body.data.noteIds);
    return Response.json(items);
  } catch (error) {
    if (error instanceof UserFacingError) return Response.json({ code: error.code }, { status: 429 });
    console.error("notebook review: generation failed", error);
    return Response.json({ error: "Review generation is unavailable" }, { status: 502 });
  }
}
