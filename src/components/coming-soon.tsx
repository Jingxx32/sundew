import { Sparkles } from "lucide-react";

import { Chip } from "@/components/ui/chip";

export function ComingSoon({
  title,
  description,
  sprint,
}: {
  title: string;
  description: string;
  sprint?: string;
}) {
  return (
    <div className="px-10 py-10 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-[38px] font-bold tracking-[-0.035em]">
          {title}
        </h1>
        {sprint && <Chip variant="accent">Sprint {sprint}</Chip>}
      </div>
      <p className="text-base text-muted-foreground">{description}</p>

      <div className="mt-12 rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
        <Sparkles className="h-6 w-6 text-accent mx-auto mb-3" />
        <p className="font-serif text-lg text-foreground">
          Not yet implemented in v0.1
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This page will come online in a later sprint.
        </p>
      </div>
    </div>
  );
}
