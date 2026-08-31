"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { changeGapType, setGapStatus, type GapListRow } from "@/lib/actions/vocab-gaps";
import type { VocabGapType, VocabGapStatus } from "@/lib/db/schema";

const TYPE_LABEL: Record<VocabGapType, string> = {
  recognition: "Inconnu",
  listening: "Mal entendu",
  production: "À réemployer",
};

const STATUS_LABEL: Record<VocabGapStatus, string> = {
  active: "Actif",
  mastered: "Acquis",
  dismissed: "Retiré",
};

const FILTERS: { label: string; value: "all" | VocabGapType }[] = [
  { label: "Tous", value: "all" },
  { label: "Inconnu", value: "recognition" },
  { label: "Mal entendu", value: "listening" },
  { label: "À réemployer", value: "production" },
];

export function GapList({ rows }: { rows: GapListRow[] }) {
  const [filter, setFilter] = useState<"all" | VocabGapType>("all");
  const [pending, startTransition] = useTransition();

  const filtered = filter === "all" ? rows : rows.filter((r) => r.gapType === filter);

  function onTypeChange(gapId: string, gapType: VocabGapType) {
    startTransition(async () => {
      await changeGapType(gapId, gapType);
    });
  }

  function onStatus(gapId: string, status: VocabGapStatus) {
    startTransition(async () => {
      await setGapStatus(gapId, status);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3 h-8 rounded-full transition-colors",
              filter === f.value
                ? "bg-foreground text-background font-medium"
                : "bg-surface text-muted-foreground hover:text-foreground border border-border/60",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-border/60 bg-surface-muted/60 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Mot</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Boîte</th>
              <th className="px-3 py-2 font-medium">Statut</th>
              <th className="px-3 py-2 font-medium">Prochaine révision</th>
              <th className="px-3 py-2 font-medium" aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.gapId} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 font-serif text-sm">
                  {row.lemma}
                  {row.translation && <span className="ml-1.5 text-muted-foreground">— {row.translation}</span>}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.gapType}
                    disabled={pending}
                    onChange={(e) => onTypeChange(row.gapId, e.target.value as VocabGapType)}
                    className="rounded border border-border/60 bg-surface px-1.5 py-1 text-xs"
                  >
                    {(Object.keys(TYPE_LABEL) as VocabGapType[]).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">{row.box}</td>
                <td className="px-3 py-2">{STATUS_LABEL[row.status]}</td>
                <td className="px-3 py-2">{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(row.dueAt)}</td>
                <td className="px-3 py-2 text-right">
                  {row.status === "dismissed" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onStatus(row.gapId, "active")}
                      className="text-accent hover:underline disabled:opacity-50"
                    >
                      Réactiver
                    </button>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onStatus(row.gapId, "mastered")}
                        className="text-muted-foreground hover:text-success disabled:opacity-50"
                      >
                        Acquis
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onStatus(row.gapId, "dismissed")}
                        className="text-muted-foreground hover:text-danger disabled:opacity-50"
                      >
                        Retirer
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Aucun mot dans cette catégorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
