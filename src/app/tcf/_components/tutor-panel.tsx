"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { getTutorThread, proposeTutorCard, type TutorThreadMessage } from "@/lib/actions/tcf-notebook";
import { parseEvents } from "@/lib/tcf/tutor/ndjson";
import type { CardProposalResult } from "@/lib/tcf/tutor/schemas";
import { USER_ERROR_MESSAGES, type UserErrorCode } from "@/lib/user-error";
import { CardDraft } from "./card-draft";
import { TcfMarkdown } from "./explanation-panel";

type Turn = { id: string; role: "user" | "assistant"; content: string; point: string | null };
type Failure = { message: string; retry: boolean };

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

function toTurn(m: TutorThreadMessage): Turn {
  return { id: m.id, role: m.role, content: m.content, point: m.note?.point ?? null };
}

async function failureOf(res: Response): Promise<Failure> {
  const body: unknown = await res.json().catch(() => null);
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code === "string" && Object.hasOwn(USER_ERROR_MESSAGES, code)) {
    return { message: USER_ERROR_MESSAGES[code as UserErrorCode], retry: false };
  }
  return { message: "Réponse interrompue — réessayer", retry: true };
}

export type TutorStatus = { answers: number; streaming: boolean };

export function TutorPanel({
  questionId,
  chosen,
  revealed,
  onStatus,
}: {
  questionId: string;
  chosen: number | null;
  /** False before the learner answers: the tutor gets no key and proposes no card. */
  revealed: boolean;
  /** Called when the number of answers or the streaming state changes. */
  onStatus?: (status: TutorStatus) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState<{ ask: string; text: string } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [proposals, setProposals] = useState<Record<string, CardProposalResult>>({});
  const controller = useRef<AbortController | null>(null);
  const lastAsk = useRef("");
  const alive = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);
  const answers = turns.filter((t) => t.role === "assistant").length;

  useEffect(() => {
    onStatus?.({ answers, streaming });
  }, [answers, streaming, onStatus]);

  // Follow the conversation: new turns, streamed text and a fresh draft keep the latest in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, partial?.text, proposals, failure]);

  useEffect(() => {
    alive.current = true;
    getTutorThread(questionId)
      .then((thread) => alive.current && setTurns(thread.map(toTurn)))
      .catch(() => {});
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, [questionId]);

  function propose(messageId: string) {
    proposeTutorCard(messageId)
      .then((result) => {
        if (alive.current && result.type !== "none") setProposals((p) => ({ ...p, [messageId]: result }));
      })
      .catch(() => {});
  }

  function added(messageId: string, point: string) {
    setTurns((t) => t.map((m) => (m.id === messageId ? { ...m, point } : m)));
    setProposals((p) => {
      const rest = { ...p };
      delete rest[messageId];
      return rest;
    });
  }

  async function send(ask: string) {
    if (streaming || !ask.trim()) return;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    lastAsk.current = ask;
    setStreaming(true);
    setFailure(null);
    setPartial({ ask, text: "" });
    try {
      const res = await fetch("/api/tcf/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, chosen, revealed, ask }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const f = await failureOf(res);
        if (ctl.signal.aborted) return;
        setFailure(f);
        setPartial(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      let doneId: string | null = null;
      let failed = false;
      while (!failed && doneId === null) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseEvents(buffer);
        buffer = parsed.rest;
        for (const ev of parsed.events) {
          if (ev.type === "delta") text += ev.text;
          else if (ev.type === "done") doneId = ev.messageId;
          else failed = true;
        }
        if (ctl.signal.aborted) return;
        setPartial({ ask, text });
      }
      if (ctl.signal.aborted) return;
      if (doneId === null) {
        setFailure({ message: "Réponse interrompue — réessayer", retry: true });
        return;
      }
      const messageId = doneId;
      setTurns((t) => [
        ...t,
        { id: `u-${messageId}`, role: "user", content: ask, point: null },
        { id: messageId, role: "assistant", content: text, point: null },
      ]);
      setPartial(null);
      setInput("");
      // A card is drafted with the answer key in view, so it could give the answer away.
      if (revealed) propose(messageId);
    } catch (err) {
      if (isAbort(err) || ctl.signal.aborted) return;
      setFailure({ message: "Réponse interrompue — réessayer", retry: true });
    } finally {
      if (controller.current === ctl && !ctl.signal.aborted) setStreaming(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Tuteur">
      <div ref={scroller} data-tutor-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {turns.length === 0 && !partial && !failure && (
          <p className="text-sm text-muted-foreground">
            Posez une question sur un mot, une phrase ou une option de cette question.
          </p>
        )}
        {turns.length > 0 && (
          <ul className="mb-4 space-y-3">
            {turns.map((t) => (
              <li key={t.id} className={t.role === "user" ? "text-sm font-semibold text-foreground" : "text-sm"}>
                {t.role === "user" ? t.content : <TcfMarkdown>{t.content}</TcfMarkdown>}
                {t.point && <p className="mt-1 text-xs text-muted-foreground">Ajouté au carnet · {t.point}</p>}
                {proposals[t.id] && !t.point && (
                  <CardDraft messageId={t.id} proposal={proposals[t.id]} onAdded={(point) => added(t.id, point)} />
                )}
              </li>
            ))}
          </ul>
        )}
        {partial && (
          <div className="mb-4 space-y-3 text-sm">
            <p className="font-semibold text-foreground">{partial.ask}</p>
            {partial.text && <TcfMarkdown>{partial.text}</TcfMarkdown>}
          </div>
        )}
        {failure && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {failure.retry ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-sm text-danger"
                onClick={() => {
                  setPartial(null);
                  void send(lastAsk.current);
                }}
              >
                {failure.message}
              </Button>
            ) : (
              failure.message
            )}
          </p>
        )}
      </div>
      <div className="border-t border-border/60 p-3">
        <Textarea
          value={input}
          className="min-h-[72px]"
          disabled={streaming}
          maxLength={1000}
          placeholder="Posez votre question…"
          aria-label="Question pour le tuteur"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(input.trim());
            }
          }}
        />
      </div>
    </section>
  );
}
