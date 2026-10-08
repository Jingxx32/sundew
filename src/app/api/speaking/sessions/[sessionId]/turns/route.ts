import { AuthenticationError, authErrorStatus } from "@/lib/auth/session";
import { requireFeature } from "@/lib/access/guard";
import { processSimulationTurn } from "@/lib/speaking/voice";
import { MAX_TURN_BYTES } from "@/lib/speaking/audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  let user;
  try { user = await requireFeature("speaking"); }
  catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "Unauthorized" }, { status: authErrorStatus(error.code) });
    throw error;
  }
  const { sessionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return Response.json({ error: "Invalid session" }, { status: 400 });
  const requestKey = request.headers.get("idempotency-key");
  if (!requestKey || !/^[0-9a-f-]{36}$/i.test(requestKey)) return Response.json({ error: "Invalid request key" }, { status: 400 });
  if (Number(request.headers.get("content-length")) > MAX_TURN_BYTES + 10_000) return Response.json({ error: "Audio too large" }, { status: 413 });
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size > MAX_TURN_BYTES) return Response.json({ error: "Invalid audio" }, { status: 400 });
  try {
    const result = await processSimulationTurn(user.id, sessionId, requestKey, Buffer.from(await audio.arrayBuffer()));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speaking turn failed";
    return Response.json({ error: message }, { status: 422 });
  }
}
