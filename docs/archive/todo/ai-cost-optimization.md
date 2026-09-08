# TODO — AI Cost Optimization (Tier 1 / Tier 2 Model Selection)

> Status: **future optimization direction; do not implement yet**
> Recorded: 2026-06-21
> Context: this is a personal single-user app with very low current cost. This document is a reference for future scale or cost-cutting work.

## Current two-tier AI model setup

Vocabulary lookup uses a two-tier model setup, corresponding to two separate AI calls:

| Tier | Trigger | Current model | Approximate cost per call | Notes |
|---|---|---|---|---|
| **Tier 1** lookup | On text selection (cache miss) | `gpt-4o-mini` | ~$0.0002 | Lightweight: translation / in-context meaning / example sentence + lemma |
| **Tier 2** enriched entry | On Save | `gpt-4o` | ~$0.011 | Full `verb_schema_spec.md` entry, including verb-conjugation tables |

> Other `gpt-4o` uses: writing-task generation and writing feedback. Models are configured through `MODELS` in `src/lib/ai/client.ts`.

**Key fact: Tier 2 and writing feedback (`gpt-4o`), not lookup, drive cost.** One thousand lookups cost only about ¥1.4; each Tier 2 call costs about ¥0.08.

## Lowest-cost model price comparison across three providers

> Prices are per million tokens (input / output). Gemini data is an estimate from training knowledge through 2026-01; defer to the official [ai.google.dev/pricing](https://ai.google.dev/pricing) page.

| Provider / model | Input | Output | Relative to gpt-4o-mini |
|---|---|---|---|
| Gemini 1.5 Flash-8B | ~$0.0375 | ~$0.15 | ~0.25× |
| Gemini 2.0 Flash-Lite | ~$0.075 | ~$0.30 | ~0.5× |
| **OpenAI gpt-4o-mini** (current Tier 1) | $0.15 | $0.60 | 1× |
| Claude Haiku 4.5 | $1.00 | $5.00 | ~7× |

**Cost order: Gemini < OpenAI < Claude.** At single-user scale, though, the absolute difference is tiny (the providers differ by less than ¥1 for 1,000 lookups).

## Optimization options (ranked by value)

### Option A: No migration cost — downgrade Tier 2 to gpt-4o-mini (recommended first experiment)
- Change `MODELS.task` (or a dedicated enrich model) from `gpt-4o` to `gpt-4o-mini`.
- Entry generation uses structured output, so mini will likely suffice; **retain gpt-4o for writing feedback, where accuracy matters**.
- Change: `src/lib/ai/client.ts`, then validate enriched-entry quality.
- Benefit: Tier 2 cost falls from about $0.011 to $0.0002 per call—**an order-of-magnitude reduction**.

### Option B: Move to Gemini (worthwhile only at high volume)
- Gemini Flash models are sufficient for simple lookup tasks and cost roughly half as much as OpenAI.
- **Migration cost is significant**: change the calling conventions in `client.ts`, `lookup.ts`, and `enrich.ts`; convert structured output from Zod `zodResponseFormat` to Gemini's `responseSchema`; then retest every AI flow.
- It is **not worthwhile** for a single user: the savings do not offset implementation and debugging time.

### Option C: Move to Claude
- Claude Haiku 4.5 costs about 7× as much as OpenAI for lookup, so **do not consider it** for Tier 1.
- For Tier 2 against `gpt-4o`, though, Haiku 4.5 costs about $0.005 per call—roughly half as much because gpt-4o is itself costly. It is an option if Claude's output quality is desired; otherwise Option A costs less.

## Decision recommendation

1. **Now:** Keep the all-OpenAI setup. The implementation is established and cost is negligible.
2. **First cost-saving step:** Execute Option A (Tier 2 → gpt-4o-mini): no migration and immediate effect.
3. **Triggers for seriously considering Gemini:**
   - The app opens to multiple users and call volume grows by an order of magnitude; or
   - TCF listening needs native audio understanding or generation, where Gemini is strong.

## Related files
- `src/lib/ai/client.ts` — 模型配置 `MODELS`
- `src/lib/ai/lookup.ts` — Tier 1 lookup
- `src/lib/ai/enrich.ts` — Tier 2 enriched entries
- `src/lib/ai/feedback.ts` — writing feedback (gpt-4o)
