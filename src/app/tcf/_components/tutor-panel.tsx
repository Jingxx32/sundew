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

export function TutorPanel({ questionId, chosen }: { questionId: string; chosen: number | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState<{ ask: string; text: string } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [proposal, setProposal] = useState<{ messageId: string; result: CardProposalResult } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    getTutorThread(questionId)
      .then((thread) => alive && setTurns(thread.map(toTurn)))
      .catch(() => {});
    return () => {
      alive = false;
      controller.current?.abort();
    };
  }, [questionId]);

  async function send(ask: string) {
    if (busy.current || !ask.trim()) return;
    busy.current = true;
    const ctl = new AbortController();
    controller.current = ctl;
    setStreaming(true);
    setFailure(null);
    setProposal(null);
    setPartial({ ask, text: "" });
    try {
      const res = await fetch("/api/tcf/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, chosen, ask }),
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
      setStreaming(false);
      busy.current = false;
      const result = await proposeTutorCard(messageId).catch(() => null);
      if (!ctl.signal.aborted && result && result.type !== "none") setProposal({ messageId, result });
    } catch (err) {
      if (isAbort(err) || ctl.signal.aborted) return;
      setFailure({ message: "Réponse interrompue — réessayer", retry: true });
    } finally {
      if (!ctl.signal.aborted) {
        busy.current = false;
        setStreaming(false);
      }
    }
  }

  return (
    <section className="mt-6" aria-label="Tuteur">
      {turns.length > 0 && (
        <ul className="mb-4 space-y-3">
          {turns.map((t) => (
            <li key={t.id} className={t.role === "user" ? "text-sm font-semibold text-foreground" : "text-sm"}>
              {t.role === "user" ? t.content : <TcfMarkdown>{t.content}</TcfMarkdown>}
              {t.point && <p className="mt-1 text-xs text-muted-foreground">Ajouté au carnet · {t.point}</p>}
              {proposal?.messageId === t.id && <CardDraft messageId={t.id} proposal={proposal.result} />}
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
          {failure.retry && partial ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-sm text-danger"
              onClick={() => {
                const ask = partial.ask;
                setPartial(null);
                void send(ask);
              }}
            >
              {failure.message}
            </Button>
          ) : (
            failure.message
          )}
        </p>
      )}
      <Textarea
        value={input}
        disabled={streaming}
        rows={2}
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
    </section>
  );
}
