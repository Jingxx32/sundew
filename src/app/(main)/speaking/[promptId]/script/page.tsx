export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPromptWithScript } from "@/lib/actions/speaking";
import { ScriptWorkbench } from "../../_components/script-workbench";

export default async function ScriptPracticePage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;
  const { prompt, script } = await getPromptWithScript(promptId);

  return (
    <div className="px-10 py-10 max-w-5xl mx-auto">
      <Link
        href="/speaking"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Expression orale
      </Link>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
        Tâche {prompt.task}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight mb-2">{prompt.prompt}</h1>
      {prompt.context && <p className="text-sm text-muted-foreground mb-6">{prompt.context}</p>}
      <ScriptWorkbench prompt={prompt} initialScript={script} />
    </div>
  );
}
