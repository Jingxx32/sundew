"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { setStudyGoal, type StudyGoal } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CLB_OPTIONS = [4, 5, 6, 7, 8, 9, 10];
const inputClasses = "h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

export function StudyGoalEditor({ initial }: { initial: StudyGoal }) {
  const [learningMode, setLearningMode] = useState<StudyGoal["learningMode"]>(initial.learningMode);
  const [targetClb, setTargetClb] = useState(initial.targetClb === null ? "" : String(initial.targetClb));
  const [examDate, setExamDate] = useState(initial.examDate ?? "");
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  function handleSave() {
    setSaved(false);
    setError(false);
    startTransition(async () => {
      try {
        await setStudyGoal({ learningMode, targetClb: targetClb ? Number(targetClb) : null, examDate: examDate || null, timeZone });
        setSaved(true);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Main direction</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["general", "tcf"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setLearningMode(mode)} aria-pressed={learningMode === mode} className={cn("rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", learningMode === mode ? "border-accent/40 bg-accent-soft text-accent" : "border-border bg-surface text-muted-foreground hover:text-foreground")}>
              <span className="block text-sm font-semibold">{mode === "general" ? "General French" : "TCF preparation"}</span>
              <span className="mt-0.5 block text-[11px]">{mode === "general" ? "Daily language practice" : "Exam-focused practice"}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {learningMode === "tcf" && (
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">Target CLB/NCLC
            <select value={targetClb} onChange={(event) => setTargetClb(event.target.value)} className={inputClasses}>
              <option value="">Not set</option>
              {CLB_OPTIONS.map((n) => <option key={n} value={n}>CLB {n}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">Exam date (optional)
            <input type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} className={inputClasses} />
          </label>
        </div>
      )}

      <label className="flex max-w-sm flex-col gap-1.5 text-xs text-muted-foreground">Time zone
        <input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className={inputClasses} placeholder="America/Toronto" />
        <span>Used to decide when a day and week begin. <button type="button" className="text-accent hover:underline" onClick={() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}>Use this device</button></span>
      </label>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={pending} size="sm">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved && !pending ? "Saved" : "Save goal"}
        </Button>
        {error && <p className="text-xs text-danger">The goal could not be saved. Check the date and time zone.</p>}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Changing direction keeps your previous exam details and practice history. Your self-declared CEFR level controls exercise difficulty; it is not an assessment result.</p>
    </div>
  );
}
