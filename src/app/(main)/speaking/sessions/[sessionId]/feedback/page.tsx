export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSimulation } from "@/lib/actions/speaking-simulation";
import { FeedbackWorkbench } from "../../../_components/feedback-workbench";

export default async function FeedbackPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const state = await getSimulation(sessionId);
  if (!state) notFound();
  return <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
    <Link href={`/speaking/sessions/${sessionId}`} className="text-sm text-accent hover:underline">← Saved conversation</Link>
    <h1 className="mt-7 text-3xl font-semibold">Practice feedback</h1>
    <p className="mt-2 text-sm text-muted-foreground">Evidence from this conversation, not an official TCF score. Automatic transcription may contain errors.</p>
    <FeedbackWorkbench state={state} />
  </main>;
}
