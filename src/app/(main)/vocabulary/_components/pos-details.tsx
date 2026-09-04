"use client";

import type { FrenchVocabEntry } from "@/lib/ai/enrich";

/* Tiny shared building blocks ------------------------------------------------ */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
      {children}
    </h3>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

const GENDER_LABEL: Record<string, string> = {
  m: "masculin · le",
  f: "féminin · la",
};

const PLACEMENT_LABEL: Record<string, string> = {
  before: "before the noun",
  after: "after the noun",
  either: "before or after",
};

/* Per-POS renderers ---------------------------------------------------------- */

function NounDetails({ noun }: { noun: NonNullable<FrenchVocabEntry["noun"]> }) {
  return (
    <section className="space-y-1">
      <Label>Noun</Label>
      <Field label="gender" value={GENDER_LABEL[noun.gender] ?? noun.gender} />
      <Field label="plural" value={noun.plural} />
      <Field label="hint" value={noun.gender_hint} />
    </section>
  );
}

function AdjectiveDetails({ adjective }: { adjective: NonNullable<FrenchVocabEntry["adjective"]> }) {
  const f = adjective.forms;
  return (
    <section className="space-y-1.5">
      <Label>Adjective</Label>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-0.5 font-mono text-xs">
        <span />
        <span className="text-muted-foreground">masc.</span>
        <span className="text-muted-foreground">fém.</span>
        <span className="text-muted-foreground">sing.</span>
        <span className="text-foreground">{f.ms}</span>
        <span className="text-foreground">{f.fs}</span>
        <span className="text-muted-foreground">plur.</span>
        <span className="text-foreground">{f.mp}</span>
        <span className="text-foreground">{f.fp}</span>
      </div>
      <Field label="position" value={PLACEMENT_LABEL[adjective.placement] ?? adjective.placement} />
      <Field label="comparison" value={adjective.comparison} />
    </section>
  );
}

function AdverbDetails({ adverb }: { adverb: NonNullable<FrenchVocabEntry["adverb"]> }) {
  if (!adverb.formed_from && !adverb.formation_note && !adverb.position_note) return null;
  return (
    <section className="space-y-1">
      <Label>Adverb</Label>
      <Field label="from" value={adverb.formed_from} />
      <Field label="formation" value={adverb.formation_note} />
      <Field label="position" value={adverb.position_note} />
    </section>
  );
}

function PrepositionDetails({
  preposition,
}: {
  preposition: NonNullable<FrenchVocabEntry["preposition"]>;
}) {
  return (
    <section className="space-y-1.5">
      <Label>Preposition</Label>
      {preposition.governs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {preposition.governs.map((g, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-md bg-surface-muted px-2 py-0.5 font-mono text-xs text-foreground"
            >
              {g}
            </span>
          ))}
        </div>
      )}
      <Field label="contractions" value={preposition.contractions} />
      <Field label="vs." value={preposition.contrast_note} />
    </section>
  );
}

function ExpressionDetails({
  expression,
}: {
  expression: NonNullable<FrenchVocabEntry["expression"]>;
}) {
  if (!expression.literal && !expression.pattern) return null;
  return (
    <section className="space-y-1">
      <Label>Expression</Label>
      <Field label="literally" value={expression.literal} />
      <Field
        label="pattern"
        value={expression.pattern ? <span className="font-mono">{expression.pattern}</span> : null}
      />
    </section>
  );
}

/* Public component ----------------------------------------------------------- */

const REGISTER_LABEL: Record<string, string> = {
  formal: "formal",
  neutral: "neutral",
  informal: "informal",
};

export function PosDetails({ entry }: { entry: FrenchVocabEntry }) {
  return (
    <>
      {entry.register && entry.register !== "neutral" && (
        <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {REGISTER_LABEL[entry.register] ?? entry.register}
        </span>
      )}

      {entry.note && (
        <section>
          <Label>Note</Label>
          <p className="text-sm text-foreground">{entry.note}</p>
        </section>
      )}

      {entry.noun && <NounDetails noun={entry.noun} />}
      {entry.adjective && <AdjectiveDetails adjective={entry.adjective} />}
      {entry.adverb && <AdverbDetails adverb={entry.adverb} />}
      {entry.preposition && <PrepositionDetails preposition={entry.preposition} />}
      {entry.expression && <ExpressionDetails expression={entry.expression} />}
    </>
  );
}
