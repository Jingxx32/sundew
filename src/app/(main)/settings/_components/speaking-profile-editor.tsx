"use client";

import { useState, useTransition } from "react";
import { setSpeakingProfile } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";

type Props = { initialValue: string };

export function SpeakingProfileEditor({ initialValue }: Props) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await setSpeakingProfile(value.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        placeholder="Votre métier, votre ville, votre famille, pourquoi le Canada, vos loisirs… (français ou chinois)"
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
      />
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending || value.trim() === initialValue.trim()}
        >
          {isPending ? "Saving…" : "Save profile"}
        </Button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
    </div>
  );
}
