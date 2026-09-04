export const dynamic = "force-dynamic";

import { listPromptsWithStats } from "@/lib/actions/speaking";
import { PromptList } from "./_components/prompt-list";

export default async function SpeakingPage() {
  const prompts = await listPromptsWithStats();

  return (
    <div className="px-10 py-10 max-w-3xl mx-auto">
      <h1 className="text-[38px] font-bold tracking-[-0.035em] mb-1">
        Expression orale
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        TCF Canada speaking practice — generate a personal script, then drill your pronunciation.
      </p>
      <PromptList prompts={prompts} />
    </div>
  );
}
