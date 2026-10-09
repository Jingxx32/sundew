import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CEFR_CHIP_CLASSES, type CefrLevel } from "@/lib/cefr";
import type { Document } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export function ContinueReadingCard({ document }: { document: Document }) {
  const level = (document.estimatedLevel ?? "B1") as CefrLevel;
  const progress = Math.max(0, Math.min(100, document.readingProgress));
  const wordsRemaining = Math.max(
    0,
    Math.round(document.wordCount * (1 - progress / 100)),
  );
  const lastRead = document.lastReadAt ?? document.createdAt;
  const excerpt = document.content.slice(0, 220).trim();

  return (
    <Card className="p-7">
      <div className="text-[11px] uppercase tracking-wider text-accent font-medium mb-3">
        Continue Reading
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-foreground">
            {document.title}
          </h2>
          {document.source && (
            <p className="text-sm text-muted-foreground mt-1">
              {document.source}
            </p>
          )}
          <p className="mt-3 text-sm italic text-muted-foreground leading-relaxed line-clamp-2">
            “{excerpt}…”
          </p>

          <div className="mt-5 max-w-md">
            <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {progress}% read · {wordsRemaining.toLocaleString()} words remaining
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip className={cn("ring-0", CEFR_CHIP_CLASSES[level])}>
              {level}
            </Chip>
            <Chip>{document.wordCount.toLocaleString()} words</Chip>
            <Chip>
              Last read{" "}
              {formatDistanceToNow(new Date(lastRead), { addSuffix: true })}
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 lg:items-stretch lg:w-[200px] shrink-0">
          <Button size="lg" asChild>
            <Link href={`/documents/${document.id}`}>Continue Reading</Link>
          </Button>
          <Button size="lg" variant="outline" disabled title="Coming in S3">
            <Sparkles className="h-4 w-4" />
            Generate Writing Task
          </Button>
        </div>
      </div>
    </Card>
  );
}
