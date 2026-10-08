import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DrillRunner } from "../_components/drill-runner";
import { ReviewHistory } from "../_components/review-history";
import { LevelBadge } from "../_components/level-badge";
import { LEVEL_ORDER } from "@/lib/tcf/display";
import { getTcfQuestionHistory, getTcfReviewQueue, type TcfLevel } from "@/lib/actions/tcf";
import { pageGate } from "@/lib/access/page-gate";

export default async function TcfReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string; level?: string; tag?: string; q?: string }>;
}) {
  const locked = await pageGate("tcf");
  if (locked) return locked;
  const params = await searchParams;
  const skill = params.skill === "listening" || params.skill === "reading" ? params.skill : undefined;
  const level = LEVEL_ORDER.includes(params.level as TcfLevel) ? (params.level as TcfLevel) : undefined;
  const queue = await getTcfReviewQueue({ skill, level, tag: params.tag });
  const selected = queue.find((item) => item.id === params.q) ?? queue[0];
  const tags = [...new Set(queue.flatMap((item) => item.skillTags ?? []))].sort();

  const base = new URLSearchParams();
  if (skill) base.set("skill", skill);
  if (level) base.set("level", level);
  if (params.tag) base.set("tag", params.tag);
  const withQuestion = (id: string) => `/tcf/review?${new URLSearchParams({ ...Object.fromEntries(base), q: id }).toString()}`;

  const history = selected ? await getTcfQuestionHistory(selected.id) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/tcf" className="mb-3 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        TCF
      </Link>
      <h1 className="text-[30px] font-bold tracking-[-0.03em]">Centre de révision</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Répondez d’abord ; les réponses précédentes et les explications n’apparaissent qu’après.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/tcf/review"
          className={`rounded-lg border px-3 py-1.5 text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${!skill ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
        >
          Toutes les compétences
        </Link>
        {(["listening", "reading"] as const).map((item) => (
          <Link
            key={item}
            href={`/tcf/review?skill=${item}${level ? `&level=${level}` : ""}`}
            className={`rounded-lg border px-3 py-1.5 text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${skill === item ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {item === "listening" ? "Écoute" : "Lecture"}
          </Link>
        ))}
        {LEVEL_ORDER.map((item) => (
          <Link
            key={item}
            href={`/tcf/review?${new URLSearchParams({ ...(skill ? { skill } : {}), level: item }).toString()}`}
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${level === item ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {item}
          </Link>
        ))}
        {tags.map((tag) => (
          <Link
            key={tag}
            href={`/tcf/review?${new URLSearchParams({ ...(skill ? { skill } : {}), ...(level ? { level } : {}), tag }).toString()}`}
            className={`rounded-lg border px-3 py-1.5 text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${params.tag === tag ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
          >
            {tag}
          </Link>
        ))}
      </div>

      {!selected ? (
        <div className="mt-8 rounded-xl border border-dashed border-border px-8 py-16 text-center text-muted-foreground">
          Aucune question à revoir avec ces filtres.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-2">
            <p className="font-mono text-xs text-muted-foreground">{queue.length} à revoir</p>
            {queue.map((item) => (
              <Link
                key={item.id}
                href={withQuestion(item.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  item.id === selected.id ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-muted"
                }`}
              >
                <LevelBadge level={item.level} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate">{item.skill === "listening" ? "Écoute" : "Lecture"}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {item.skillTags?.join(" · ") || "Non classée"}
                  </span>
                </span>
              </Link>
            ))}
          </aside>
          <div>
            <DrillRunner
              key={selected.id}
              questions={[selected]}
              learning={[selected.learning]}
              skill={selected.skill}
              level={selected.level}
              kind="review"
              showSummaryOnComplete={false}
              syncUrl={false}
            />
            <ReviewHistory questionId={selected.id} initialHistory={history} />
          </div>
        </div>
      )}
    </div>
  );
}
