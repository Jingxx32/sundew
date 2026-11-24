"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, Textarea } from "@/components/ui/input";
import { addTutorCard, reviveNote } from "@/lib/actions/tcf-notebook";
import type { CardDraft as CardDraftData, CardProposalResult } from "@/lib/tcf/tutor/schemas";
import { userErrorMessage } from "@/lib/user-error";

const KIND_LABELS: Record<CardDraftData["kind"], string> = {
  vocabulary: "Vocabulaire",
  grammar: "Grammaire",
  hearing: "Écoute",
  comprehension: "Compréhension",
};

type Status = "draft" | "added" | "dismissed" | "revived";

const BOX = "mt-3 rounded-lg border border-border/60 bg-surface-muted/60 px-4 py-3 text-sm";

export function CardDraft({
  messageId,
  proposal,
  onAdded,
}: {
  messageId: string;
  proposal: CardProposalResult;
  onAdded?: (point: string) => void;
}) {
  if (proposal.type === "none") return null;
  if (proposal.type === "duplicate") return <DuplicateNotice noteId={proposal.noteId} point={proposal.point} />;
  return <DraftEditor messageId={messageId} initial={proposal.draft} onAdded={onAdded} />;
}

function DraftEditor({
  messageId,
  initial,
  onAdded,
}: {
  messageId: string;
  initial: CardDraftData;
  onAdded?: (point: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<Status>("draft");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (status === "dismissed") return null;
  if (status === "added") return <p className={BOX}>Ajouté au carnet · {draft.point}</p>;

  async function add() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { point } = await addTutorCard(messageId, draft);
      setDraft((d) => ({ ...d, point }));
      setStatus("added");
      onAdded?.(point);
    } catch (err) {
      setError(userErrorMessage(err, "Échec — réessayez."));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className={BOX}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">Ajouter au carnet ?</span>
        <Chip variant="accent">{KIND_LABELS[draft.kind]}</Chip>
      </div>
      <Input
        className="mt-2"
        aria-label="Point"
        value={draft.point}
        maxLength={160}
        disabled={pending}
        onChange={(e) => setDraft({ ...draft, point: e.target.value })}
      />
      {editing && (
        <div className="mt-2 space-y-2">
          <Textarea
            className="min-h-[72px]"
            aria-label="Recto"
            value={draft.front}
            maxLength={400}
            disabled={pending}
            onChange={(e) => setDraft({ ...draft, front: e.target.value })}
          />
          <Textarea
            className="min-h-[72px]"
            aria-label="Verso"
            value={draft.back}
            maxLength={400}
            disabled={pending}
            onChange={(e) => setDraft({ ...draft, back: e.target.value })}
          />
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={add} disabled={pending || !draft.point.trim() || !draft.front.trim() || !draft.back.trim()}>
          Ajouter
        </Button>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={pending}>
            Modifier
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setStatus("dismissed")} disabled={pending}>
          Ignorer
        </Button>
      </div>
    </div>
  );
}

function DuplicateNotice({ noteId, point }: { noteId: string; point: string }) {
  const [status, setStatus] = useState<Status>("draft");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (status === "dismissed") return null;
  if (status === "revived") return <p className={BOX}>Remis en révision · {point}</p>;

  async function revive() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await reviveNote(noteId);
      setStatus("revived");
    } catch (err) {
      setError(userErrorMessage(err, "Échec — réessayez."));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className={BOX}>
      <p className="text-foreground">Déjà dans le carnet · {point}</p>
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={revive} disabled={pending}>
          Revoir à nouveau
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setStatus("dismissed")} disabled={pending}>
          Ignorer
        </Button>
      </div>
    </div>
  );
}
