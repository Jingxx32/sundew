"use client";

import { useState, useTransition } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { deleteTcfQuestionAttempt, resetTcfQuestionLearningHistory, type TcfQuestionAttemptHistory } from "@/lib/actions/tcf";

function outcome(attempt: TcfQuestionAttemptHistory) {
  if (!attempt.correct) return "Incorrecte";
  return attempt.uncertain ? "Correcte, mais incertaine" : "Correcte";
}

export function ReviewHistory({ questionId, initialHistory }: { questionId: string; initialHistory: TcfQuestionAttemptHistory[] }) {
  const [history, setHistory] = useState(initialHistory);
  const [resetArmed, setResetArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  function remove(attempt: TcfQuestionAttemptHistory) {
    if (!window.confirm("Supprimer cette tentative ? L’état d’apprentissage sera recalculé.")) return;
    startTransition(async () => { await deleteTcfQuestionAttempt(attempt.id); setHistory((items) => items.filter((item) => item.id !== attempt.id)); });
  }
  function reset() {
    if (!resetArmed) { setResetArmed(true); return; }
    startTransition(async () => { await resetTcfQuestionLearningHistory(questionId); setHistory([]); setResetArmed(false); });
  }
  return <aside className="mt-6 rounded-xl border border-border/70 bg-surface p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Historique</h2><p className="text-xs text-muted-foreground">Supprimer une ligne recalcule immédiatement l’état de cette question.</p></div><button type="button" disabled={pending} onClick={reset} className="flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger hover:bg-danger-soft disabled:opacity-60"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{resetArmed ? "Confirmer la réinitialisation" : "Réinitialiser cette question"}</button></div>{resetArmed && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">Cette seconde confirmation supprime toutes les tentatives de cette question.</p>}<div className="mt-4 space-y-2">{history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune tentative enregistrée.</p> : history.map((attempt) => <div key={attempt.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-xs"><span>{new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(attempt.answeredAt)} · {attempt.mode} · {String.fromCharCode(65 + attempt.chosen)} · <strong>{outcome(attempt)}</strong></span><button type="button" disabled={pending} onClick={() => remove(attempt)} aria-label="Supprimer cette tentative" className="text-danger hover:opacity-70"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button></div>)}</div></aside>;
}
