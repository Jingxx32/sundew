"use client";

import { useRef, useState, useTransition } from "react";
import { Check, FileUp, Podcast, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import {
  confirmQuizImport,
  importQuizFromPdf,
  parseQuizFromPastedText,
} from "@/lib/actions/quiz";
import {
  preparePodcastCloze,
  confirmPodcastCloze,
} from "@/lib/actions/cloze";
import type { ParsedQuiz } from "@/lib/ai/quiz-schema";
import type { ClozePayload } from "@/lib/ai/cloze-schema";
import { cn } from "@/lib/utils";

type Meta = {
  exam: string;
  number: number | null;
  section: "reading";
  title: string;
  source: string | null;
};

type PodcastMeta = {
  url: string;
  title: string;
  source: string | null;
};

const CLOZE_ERROR_MESSAGES: Record<string, string> = {
  invalid_url: "Enter a valid http(s) link to an mp3 file.",
  too_large:
    "Episode exceeds Whisper's 25MB limit — pick a shorter episode or a clip.",
  fetch_failed:
    "Couldn't download the audio from that URL. Check the link and try again.",
  transcribe_failed:
    "Transcription failed — the file may not be valid audio.",
  select_failed:
    "Couldn't pick useful blanks from this transcript. Try another episode.",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ImportQuizDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pdf" | "podcast">("pdf");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // PDF flow step A → B state
  const [parsed, setParsed] = useState<ParsedQuiz | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [needsPaste, setNeedsPaste] = useState(false);

  // Podcast flow step A → B state
  const [clozePayload, setClozePayload] = useState<ClozePayload | null>(null);
  const [podcastMeta, setPodcastMeta] = useState<PodcastMeta | null>(null);

  const [error, setError] = useState<string | null>(null);

  function reset() {
    setParsed(null);
    setMeta(null);
    setError(null);
    setNeedsPaste(false);
    setClozePayload(null);
    setPodcastMeta(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function readMeta(form: HTMLFormElement): Meta {
    const fd = new FormData(form);
    const numberRaw = fd.get("number")?.toString().trim() ?? "";
    return {
      exam: fd.get("exam")?.toString().trim() || "TCF",
      number: numberRaw ? Number(numberRaw) : null,
      // Reading-only by design: parseQuizFromText is passage-based. Do NOT add
      // grammar/vocabulary options here without reworking the parser for
      // standalone (passage-less) MCQs — see code-audit #8.
      section: "reading",
      title: fd.get("title")?.toString().trim() ?? "",
      source: fd.get("source")?.toString().trim() || null,
    };
  }

  // PDF step A — extract + AI parse (no DB write)
  function handleParse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const nextMeta = readMeta(form);
    if (!nextMeta.title) {
      setError("Title is required.");
      return;
    }
    const fd = new FormData(form);
    const pastedText = fd.get("pastedText")?.toString() ?? "";

    setError(null);
    startTransition(async () => {
      const result = needsPaste
        ? await parseQuizFromPastedText(pastedText)
        : await importQuizFromPdf(fd);

      if (result.ok) {
        setMeta(nextMeta);
        setParsed(result.parsed);
        return;
      }
      if (result.error === "scanned") {
        setNeedsPaste(true);
        setError(
          "This PDF looks like a scan — no selectable text found. Paste the exam text below instead.",
        );
      } else if (result.error === "empty") {
        setError(
          needsPaste ? "Paste the exam text first." : "Choose a PDF file first.",
        );
      } else {
        setError(
          "Couldn't structure this document into passages and questions. Check the text and try again.",
        );
      }
    });
  }

  // PDF step C — confirmed insert
  function handleConfirm() {
    if (!parsed || !meta) return;
    setError(null);
    startTransition(async () => {
      try {
        await confirmQuizImport({ ...meta, parsed });
        handleOpenChange(false);
      } catch {
        setError("Saving failed — the database may be unreachable. Try again.");
      }
    });
  }

  // Podcast step A — fetch + transcribe + select blanks (no DB write)
  function handlePreparePodcast(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nextMeta: PodcastMeta = {
      url: fd.get("url")?.toString().trim() ?? "",
      title: fd.get("title")?.toString().trim() ?? "",
      source: fd.get("source")?.toString().trim() || null,
    };
    if (!nextMeta.url || !nextMeta.title) {
      setError("Episode URL and title are required.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await preparePodcastCloze({ url: nextMeta.url });
      if (result.ok) {
        setPodcastMeta(nextMeta);
        setClozePayload(result.payload);
      } else {
        setError(CLOZE_ERROR_MESSAGES[result.error] ?? "Import failed.");
      }
    });
  }

  // Podcast step C — confirmed insert
  function handleConfirmPodcast() {
    if (!clozePayload || !podcastMeta) return;
    setError(null);
    startTransition(async () => {
      try {
        await confirmPodcastCloze({ ...podcastMeta, payload: clozePayload });
        handleOpenChange(false);
      } catch {
        setError("Saving failed — the database may be unreachable. Try again.");
      }
    });
  }

  const questionTotal =
    parsed?.passages.reduce((sum, p) => sum + p.questions.length, 0) ?? 0;

  const inPreview = parsed !== null || clozePayload !== null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <FileUp className="h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {!inPreview && (
          <>
            <DialogHeader>
              <DialogTitle>
                {mode === "pdf"
                  ? "Import a TCF reading PDF"
                  : "Import a podcast episode"}
              </DialogTitle>
              <DialogDescription>
                {mode === "pdf"
                  ? "Upload an exam PDF. Lumière extracts the text, structures it into passages and questions with AI, and shows you a preview before anything is saved."
                  : "Paste a direct mp3 link. Lumière transcribes it with word timestamps, blanks out useful words, and shows you a preview before anything is saved."}
              </DialogDescription>
            </DialogHeader>

            {/* Source switch */}
            <div className="flex items-center gap-1.5">
              <SourceChip
                label="Exam PDF"
                icon={<FileUp className="h-3.5 w-3.5" />}
                active={mode === "pdf"}
                onClick={() => {
                  setMode("pdf");
                  setError(null);
                }}
              />
              <SourceChip
                label="Podcast"
                icon={<Podcast className="h-3.5 w-3.5" />}
                active={mode === "podcast"}
                onClick={() => {
                  setMode("podcast");
                  setError(null);
                }}
              />
            </div>

            {mode === "pdf" ? (
              <form ref={formRef} onSubmit={handleParse} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="quiz-file">
                    Exam PDF
                  </label>
                  <Input
                    id="quiz-file"
                    name="file"
                    type="file"
                    accept="application/pdf"
                    className="h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-accent"
                    disabled={needsPaste}
                  />
                </div>

                {needsPaste && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="pastedText">
                      Exam text (manual paste)
                    </label>
                    <Textarea
                      id="pastedText"
                      name="pastedText"
                      placeholder="Paste the passages, questions and answer key here…"
                      className="min-h-[160px]"
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="exam">
                      Exam
                    </label>
                    <Input id="exam" name="exam" defaultValue="TCF" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="section">
                      Section
                    </label>
                    <select
                      id="section"
                      name="section"
                      className="flex h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                      defaultValue="reading"
                    >
                      <option value="reading">Reading</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="number">
                      Set nº
                    </label>
                    <Input
                      id="number"
                      name="number"
                      type="number"
                      min={1}
                      placeholder="1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="quiz-title">
                      Title
                    </label>
                    <Input
                      id="quiz-title"
                      name="title"
                      placeholder="e.g. TCF blanc nº1 — Compréhension écrite"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-sm font-medium"
                      htmlFor="quiz-source"
                    >
                      Source{" "}
                      <span className="text-subtle-foreground">(optional)</span>
                    </label>
                    <Input
                      id="quiz-source"
                      name="source"
                      placeholder="Prep book, website…"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-danger">{error}</p>}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    <Upload className="h-4 w-4" />
                    {pending ? "Parsing…" : "Parse & preview"}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <form onSubmit={handlePreparePodcast} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="podcast-url">
                    Episode mp3 URL
                  </label>
                  <Input
                    id="podcast-url"
                    name="url"
                    type="url"
                    placeholder="https://…/episode.mp3"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Direct link to the audio file, under 25MB (≈25 min).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      className="text-sm font-medium"
                      htmlFor="podcast-title"
                    >
                      Title
                    </label>
                    <Input
                      id="podcast-title"
                      name="title"
                      placeholder="e.g. Journal en français facile — 9 juin"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      className="text-sm font-medium"
                      htmlFor="podcast-source"
                    >
                      Source{" "}
                      <span className="text-subtle-foreground">(optional)</span>
                    </label>
                    <Input
                      id="podcast-source"
                      name="source"
                      placeholder="RFI, InnerFrench…"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-danger">{error}</p>}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    <Upload className="h-4 w-4" />
                    {pending ? "Transcribing…" : "Transcribe & preview"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </>
        )}

        {parsed !== null && (
          <>
            <DialogHeader>
              <DialogTitle>Check before saving</DialogTitle>
              <DialogDescription>
                {parsed.passages.length}{" "}
                {parsed.passages.length === 1 ? "passage" : "passages"} ·{" "}
                {questionTotal} {questionTotal === 1 ? "question" : "questions"}
                . Verify the answers line up with the answer key — nothing is
                saved until you confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Chip variant="accent">
                {meta?.exam}
                {meta?.number != null ? ` nº${meta.number}` : ""}
              </Chip>
              <Chip>reading</Chip>
              <span className="text-sm font-medium">{meta?.title}</span>
            </div>

            <div className="space-y-6">
              {parsed.passages.map((passage, pIndex) => (
                <div
                  key={pIndex}
                  className="rounded-xl border border-border/70 bg-surface-muted/40 p-4 space-y-4"
                >
                  <article className="reading-prose text-sm whitespace-pre-wrap">
                    {passage.text}
                  </article>
                  {passage.questions.map((q, qIndex) => (
                    <div key={qIndex} className="space-y-1.5">
                      <p className="text-sm font-medium">
                        {qIndex + 1}. {q.questionText}
                      </p>
                      <ul className="space-y-1">
                        {q.options.map((option, oIndex) => (
                          <li
                            key={oIndex}
                            className={
                              oIndex === q.correctIndex
                                ? "flex items-start gap-1.5 text-sm text-success font-medium"
                                : "flex items-start gap-1.5 text-sm text-muted-foreground"
                            }
                          >
                            {oIndex === q.correctIndex ? (
                              <Check className="h-4 w-4 mt-0.5 shrink-0" />
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            {option}
                          </li>
                        ))}
                      </ul>
                      {q.explanation && (
                        <p className="text-xs text-muted-foreground">
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setParsed(null)}
              >
                Back
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={pending}>
                {pending
                  ? "Saving…"
                  : `Confirm & save ${questionTotal} questions`}
              </Button>
            </DialogFooter>
          </>
        )}

        {clozePayload !== null && (
          <>
            <DialogHeader>
              <DialogTitle>Check before saving</DialogTitle>
              <DialogDescription>
                {formatTime(clozePayload.durationSec)} of audio ·{" "}
                {clozePayload.blanks.length} blanks. Skim the transcript for
                transcription errors — nothing is saved until you confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Chip variant="accent">podcast</Chip>
              <Chip>dictation</Chip>
              <span className="text-sm font-medium">{podcastMeta?.title}</span>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Blanks
              </p>
              {clozePayload.blanks.map((blank, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border/60 bg-surface-muted/40 px-3 py-2"
                >
                  <p className="text-sm">{blank.questionText}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="text-success font-medium">
                      {blank.answer[0]}
                    </span>{" "}
                    · {formatTime(blank.audioStart)}–
                    {formatTime(blank.audioEnd)}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Transcript
              </p>
              <article className="reading-prose text-sm whitespace-pre-wrap max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-surface-muted/40 p-4">
                {clozePayload.transcript}
              </article>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setClozePayload(null)}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handleConfirmPodcast}
                disabled={pending}
              >
                {pending
                  ? "Saving…"
                  : `Confirm & save ${clozePayload.blanks.length} blanks`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SourceChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs transition-colors",
        active
          ? "bg-foreground text-background font-medium"
          : "bg-surface text-muted-foreground hover:text-foreground border border-border/60",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
