# 词汇缺口画像 Implementation Plan

> **状态:已完成(2026-08-31)。** 全部 9 个任务(P1 数据层+捕获 / P2 复习队列 / P3 反向驱动)已实现、逐任务用真实数据验证、直接提交在 `main`,已 push 到 `origin/main`。commit 范围 `2b7c85e..efa7038`:
> - `2b7c85e` feat(vocab): add the vocabulary_gaps table for the gap profile
> - `7f1a03f` feat(vocab): gap engine with idempotent upsert and Leitner grading
> - `72b39b6` feat(vocab): auto-ingest gaps from lookups and writing feedback
> - `73d2620` feat(tcf): mark unknown words into the vocab gap profile
> - `28614f3` feat(vocab): review queue queries and gap management actions
> - `785b345` feat(vocab): Leitner review queue with per-gap-type cards
> - `b30e4ec` feat(vocab): self-serve gap list with type/status controls
> - `dfb2fd9` feat(tcf): boost drill questions that carry active vocab gaps
> - `efa7038` feat(practice): inject production-gap words into writing tasks
>
> 唯一已知偏差:production 卡的挖空例句(§Task 6 Step 2)几乎总会退化成只显示中文释义,因为 `vocabulary_lookups.sentence_context` 列在现有查词管线里一直被写成空字符串——这是先于本计划就存在的既有行为,不是本次改出的 bug,未来想接真实例句需要另开工作。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立以词汇为核的四技能缺口画像(`vocabulary_gaps`),自动+手动捕获,驱动 Leitner 复习队列、TCF 重刷加权和写作任务注入。

**Architecture:** 新表叠加在现有 lemma 记忆(`vocabulary_lookups`)之上,每行 = (lemma, 缺口类型)。捕获在现有查词/批改/TCF 流上加钩子;消费端(复习页、drill 排序、任务 prompt)只读该表。不动 `tcf_question_attempts` / `tcf_attempts` / 现有 taxonomy。

**Tech Stack:** Next.js(App Router, server actions)、Drizzle + postgres.js(Azure PostgreSQL)、Tailwind + cva。无测试套件——每个任务以 `npx tsc --noEmit && npm run lint` + 真实数据验证收尾。

**Historical spec:** `docs/archive/specs/2026-08-31-vocab-gap-profile-design.md`

## Global Constraints

- 新表规范:uuid PK `defaultRandom()` + `timestamp(..., { withTimezone: true })`(schema.ts 现行约定)
- 所有 DB 查询 async Drizzle;禁用 `.run()/.get()/.all()`
- 颜色只用语义 token(`text-muted-foreground` 等),UI 文案与 TCF 模块一致用法语
- git commit 不带任何 Co-Authored-By / Generated with 尾注
- fire-and-forget 落库一律 `.catch(() => {})`,不打断练习
- 与 spec 的偏差(已确认合理):复习页路由用 `/vocabulary/review`(现有 sidebar 的 Vocabulary matcher `p.startsWith("/vocabulary")` 直接覆盖,不新增顶级导航);spec 里写的 `/review/vocab` 依赖尚未存在的分组导航
- schema 变更后:`npm run db:generate` → 检查生成的 SQL → `npm run db:init`

---

## Task 1: 数据模型 — `vocabulary_gaps` 表 + 迁移

**Files:**
- Modify: `src/lib/db/schema.ts`(在 `vocabularyOccurrences` 之后、quiz engine 注释块之前插入)
- Generate: `drizzle/` 新迁移文件(db:generate 产物)

**Interfaces:**
- Produces: `vocabularyGaps` 表对象、`VocabularyGap` 类型、`vocabGapTypeEnum` / `vocabGapSourceEnum` / `vocabGapStatusEnum`,后续所有任务 import 自 `@/lib/db/schema`

- [x] **Step 1: 在 schema.ts 追加 enum 与表定义**

```ts
/* ------------------------------------------------------------------ */
/*  vocabulary_gaps — per-(lemma, skill-dimension) knowledge gaps      */
/*  Historical spec: docs/archive/specs/2026-08-31-vocab-gap-profile-design.md */
/* ------------------------------------------------------------------ */

export const vocabGapTypeEnum = pgEnum("vocab_gap_type", [
  "listening",     // 听不懂 — recognises in text but not by ear
  "recognition",   // 不认识 — unknown on sight
  "production",    // 不会用 — understood but can't produce
]);

export const vocabGapSourceEnum = pgEnum("vocab_gap_source", ["lookup", "feedback", "manual"]);

export const vocabGapStatusEnum = pgEnum("vocab_gap_status", ["active", "mastered", "dismissed"]);

export const vocabularyGaps = pgTable(
  "vocabulary_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lemma: text("lemma")
      .notNull()
      .references(() => vocabularyLookups.lemma, { onDelete: "cascade" }),
    gapType: vocabGapTypeEnum("gap_type").notNull(),
    source: vocabGapSourceEnum("source").notNull(),
    status: vocabGapStatusEnum("status").notNull().default("active"),
    /** Leitner box 1–5 */
    box: integer("box").notNull().default(1),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("vocab_gaps_lemma_type_key").on(t.lemma, t.gapType),
    index("vocab_gaps_status_due_idx").on(t.status, t.dueAt),
  ],
);

export type VocabularyGap = typeof vocabularyGaps.$inferSelect;
export type VocabGapType = (typeof vocabGapTypeEnum.enumValues)[number];
export type VocabGapStatus = (typeof vocabGapStatusEnum.enumValues)[number];
```

注意:`pgEnum`、`uuid`、`unique`、`index` 均已在文件顶部 import(核对,缺则补)。

- [x] **Step 2: 生成并检查迁移**

Run: `npm run db:generate`
Expected: 新增一个迁移 SQL,内容仅有 3 个 `CREATE TYPE` + 1 个 `CREATE TABLE` + 约束/索引。打开文件肉眼核对(不得有对既有表的 ALTER/DROP)。

- [x] **Step 3: 应用迁移 + 类型检查**

Run: `npm run db:init && npx tsc --noEmit && npm run lint`
Expected: 迁移成功;tsc/lint 干净。

- [x] **Step 4: 真实验证**

Run: `npm run db:studio`(或 psql)确认 `vocabulary_gaps` 表存在、列与约束正确。手插一行再删掉,验证 (lemma,gap_type) 唯一约束(重复插入报错)。

- [x] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(vocab): add the vocabulary_gaps table for the gap profile"
```

---

## Task 2: 缺口引擎 — upsert / Leitner 判定

**Files:**
- Create: `src/lib/vocabulary/gaps.ts`(纯服务端 helper,风格仿 `src/lib/vocabulary/helpers.ts` —— 非 "use server" 文件)

**Interfaces:**
- Consumes: Task 1 的 `vocabularyGaps` / `VocabGapType`;`helpers.ts` 的 `Dbx` 类型
- Produces(后续任务的调用面):
  - `upsertGap(opts: { lemma: string; gapType: VocabGapType; source: "lookup" | "feedback" | "manual"; dbx?: Dbx }): Promise<void>`
  - `gradeGap(gapId: string, correct: boolean): Promise<{ box: number; status: VocabGapStatus }>`
  - `LEITNER_INTERVAL_DAYS: readonly number[]`

- [x] **Step 1: 实现**

```ts
/**
 * Vocabulary gap engine — upsert rules and Leitner scheduling.
 * Plain server-side helpers (NOT Server Actions), mirroring helpers.ts.
 * Historical spec: docs/archive/specs/2026-08-31-vocab-gap-profile-design.md §2
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vocabularyGaps, type VocabGapType, type VocabGapStatus } from "@/lib/db/schema";
import type { Dbx } from "./helpers";

/** Days until next review for box 1..5. Box 5 answered correctly → mastered. */
export const LEITNER_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const;

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

/**
 * Idempotent gap upsert. Rules (spec §2):
 * - no row            → insert active, box 1, due now
 * - active            → refresh source only (repeat signals never reset progress)
 * - mastered          → reactivate (forgot it): active, box 1, due now
 * - dismissed         → manual signals revive it; automatic ones respect the dismissal
 */
export async function upsertGap(opts: {
  lemma: string;
  gapType: VocabGapType;
  source: "lookup" | "feedback" | "manual";
  dbx?: Dbx;
}): Promise<void> {
  const dbx = opts.dbx ?? db;
  const existing = (
    await dbx
      .select()
      .from(vocabularyGaps)
      .where(and(eq(vocabularyGaps.lemma, opts.lemma), eq(vocabularyGaps.gapType, opts.gapType)))
      .limit(1)
  )[0];

  if (!existing) {
    await dbx.insert(vocabularyGaps).values({
      lemma: opts.lemma,
      gapType: opts.gapType,
      source: opts.source,
    });
    return;
  }
  if (existing.status === "active") {
    await dbx.update(vocabularyGaps).set({ source: opts.source }).where(eq(vocabularyGaps.id, existing.id));
    return;
  }
  if (existing.status === "mastered" || (existing.status === "dismissed" && opts.source === "manual")) {
    await dbx
      .update(vocabularyGaps)
      .set({ status: "active", box: 1, dueAt: new Date(), source: opts.source })
      .where(eq(vocabularyGaps.id, existing.id));
  }
  // dismissed + automatic source → no-op: the user said no.
}

/** Apply one review result. Correct: box+1 & schedule out (box 5 → mastered). Wrong: back to box 1, due tomorrow. */
export async function gradeGap(gapId: string, correct: boolean): Promise<{ box: number; status: VocabGapStatus }> {
  const row = (
    await db.select().from(vocabularyGaps).where(eq(vocabularyGaps.id, gapId)).limit(1)
  )[0];
  if (!row) throw new Error(`gap ${gapId} not found`);

  let box: number;
  let status: VocabGapStatus;
  let dueAt: Date;
  if (correct) {
    if (row.box >= 5) {
      box = 5;
      status = "mastered";
      dueAt = row.dueAt; // irrelevant once mastered
    } else {
      box = row.box + 1;
      status = "active";
      dueAt = days(LEITNER_INTERVAL_DAYS[box - 1]);
    }
  } else {
    box = 1;
    status = "active";
    dueAt = days(1);
  }
  await db
    .update(vocabularyGaps)
    .set({ box, status, dueAt, lastReviewedAt: new Date() })
    .where(eq(vocabularyGaps.id, gapId));
  return { box, status };
}
```

- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit && npm run lint`
Expected: 干净。

- [x] **Step 3: 真实验证(node 脚本一次性跑)**

在 scratchpad 写临时脚本(用 `npx tsx`,加载 `.env.local` 的 DATABASE_URL):先手插一个 lookup 词条,然后依次调 `upsertGap`(重复调确认幂等)、`gradeGap` 对/错各一次,console.log 每步后的行状态,最后清理测试行。把输出贴给用户。

- [x] **Step 4: Commit**

```bash
git add src/lib/vocabulary/gaps.ts
git commit -m "feat(vocab): gap engine with idempotent upsert and Leitner grading"
```

---

## Task 3: 自动汇入 — 查词 → recognition,批改 → production

**Files:**
- Modify: `src/lib/actions/vocabulary.ts`(`resolveLookup` 两个分支)
- Modify: `src/lib/actions/tasks.ts`(`persistFeedback`,约 :203-241)

**Interfaces:**
- Consumes: Task 2 `upsertGap`;`helpers.ts` 的 `norm`、`resolveLemma`、`upsertEntry`、`upsertAlias`
- Produces: 无新导出(纯钩子)

- [x] **Step 1: 查词钩子**

`resolveLookup` 的两个返回路径都补 upsertGap:

- 缓存命中分支(`if (row) { ... }`):`recordOccurrence` 之后加
  `await upsertGap({ lemma, gapType: "recognition", source: "lookup" });`
- 缓存未命中分支:事务内(`recordOccurrence` 之后)加
  `await upsertGap({ lemma: resolved, gapType: "recognition", source: "lookup", dbx: tx });`

- [x] **Step 2: 批改钩子**

`persistFeedback` 末尾(errors insert 之后)追加——词汇类错误的 `correction` 是学习者"不会用"的正确表达:

```ts
// Vocabulary-category corrections are words the learner failed to produce —
// feed them into the gap profile (fire-and-forget; feedback must never fail on this).
try {
  const vocabCorrections = feedback.errors
    .filter((err) => err.category === "Vocabulary")
    .map((err) => err.correction.trim())
    // Multi-word corrections are usually rephrasings, not a single learnable item.
    .filter((c) => c.length > 1 && c.split(/\s+/).length <= 3);
  for (const correction of vocabCorrections) {
    const lemma = await ensureEntryForWord(correction);
    if (lemma) await upsertGap({ lemma, gapType: "production", source: "feedback" });
  }
} catch (err) {
  console.error("[feedback] vocab gap ingest failed:", err);
}
```

`ensureEntryForWord` 新增到 `src/lib/vocabulary/helpers.ts`(词条保障,不写 occurrence——feedback 缺口没有阅读出处):

```ts
/** Ensure a lookup entry exists for a word; returns its lemma (null when the AI lookup fails). */
export async function ensureEntryForWord(word: string): Promise<string | null> {
  const known = await resolveLemma(word);
  if (known) return known;
  const { lookupWord } = await import("@/lib/ai/lookup");
  try {
    const result = await lookupWord(word, "");
    const lemma = norm(result.lemma || word);
    await upsertEntry(lemma, word, result);
    await upsertAlias(norm(word), lemma);
    return lemma;
  } catch {
    return null;
  }
}
```

- [x] **Step 3: 类型检查**

Run: `npx tsc --noEmit && npm run lint`

- [x] **Step 4: 真实验证**

dev server 下:(a) 在阅读页查一个新词 → 查库确认 `vocabulary_gaps` 出现 recognition 行;再查同一个词 → 仍只有一行。(b) 提交一篇故意含词汇错误的写作(或复用现有 submission 重新生成批改)→ 确认 production 行出现。把两个 SQL 查询结果贴给用户。

- [x] **Step 5: Commit**

```bash
git add src/lib/actions/vocabulary.ts src/lib/actions/tasks.ts src/lib/vocabulary/helpers.ts
git commit -m "feat(vocab): auto-ingest gaps from lookups and writing feedback"
```

---

## Task 4: TCF 手动标记浮标

**Files:**
- Create: `src/lib/actions/vocab-gaps.ts`("use server")
- Create: `src/app/tcf/_components/mark-gap-floater.tsx`(client)
- Modify: `src/app/tcf/_components/drill-runner.tsx`(包住 QuestionMedia 与 transcript 块)

**Interfaces:**
- Consumes: `resolveLookup`(actions/vocabulary.ts)、`upsertGap`(Task 2)
- Produces: `markTcfVocabGap(input: { surface: string; sentenceContext: string; tcfQuestionId: string; gapType: VocabGapType }): Promise<void>`

- [x] **Step 1: server action**

`src/lib/actions/vocab-gaps.ts`:

```ts
"use server";

import { resolveLookup } from "@/lib/actions/vocabulary";
import { upsertGap } from "@/lib/vocabulary/gaps";
import type { VocabGapType } from "@/lib/db/schema";

/** Manual gap marking from a TCF question. Creates the entry (cache-first lookup),
 *  the occurrence, and the gap row. */
export async function markTcfVocabGap(input: {
  surface: string;
  sentenceContext: string;
  tcfQuestionId: string;
  gapType: VocabGapType;
}): Promise<void> {
  const { lemma } = await resolveLookup(input.surface, input.sentenceContext, {
    type: "tcf",
    tcfQuestionId: input.tcfQuestionId,
  });
  await upsertGap({ lemma, gapType: input.gapType, source: "manual" });
}
```

注:resolveLookup 已含 recognition 自动汇入(Task 3),手动标记会先落 recognition 再 upsert 目标类型——标 recognition 时二者相同(幂等),标 listening/production 时会同时留下 recognition 行。这符合语义:你查了这个词,说明看见也不确定。若用户反馈太吵,后续可给 resolveLookup 加 `skipGap` 参数,本期不做。

- [x] **Step 2: 浮标组件**

`mark-gap-floater.tsx` — 包裹容器,监听选区,浮出按钮组:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { markTcfVocabGap } from "@/lib/actions/vocab-gaps";
import type { VocabGapType } from "@/lib/db/schema";

const LABELS: Record<VocabGapType, string> = {
  recognition: "Inconnu",
  listening: "Mal entendu",
  production: "À réemployer",
};

/** Which buttons show, in order; first is the visually-primary default. */
function gapChoices(skill: "listening" | "reading"): VocabGapType[] {
  return skill === "listening" ? ["listening", "recognition", "production"] : ["recognition", "production"];
}

export function MarkGapFloater({
  skill,
  questionId,
  children,
}: {
  skill: "listening" | "reading";
  questionId: string;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{ x: number; y: number; surface: string; context: string } | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");

  const onSelect = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return setPopover(null);
    const text = sel.toString().trim();
    // A markable unit is a word or short expression, not a sentence.
    if (!text || text.length > 40 || text.split(/\s+/).length > 4) return setPopover(null);
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return setPopover(null);
    const rect = range.getBoundingClientRect();
    const host = containerRef.current.getBoundingClientRect();
    // ±80 chars of surrounding block text as sentence context
    const block = range.startContainer.parentElement?.textContent ?? "";
    const at = block.indexOf(text);
    const context = at >= 0 ? block.slice(Math.max(0, at - 80), at + text.length + 80).trim() : block.slice(0, 160);
    setState("idle");
    setPopover({ x: rect.left - host.left + rect.width / 2, y: rect.top - host.top, surface: text, context });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, [onSelect]);

  function mark(gapType: VocabGapType) {
    if (!popover) return;
    setState("saving");
    markTcfVocabGap({ surface: popover.surface, sentenceContext: popover.context, tcfQuestionId: questionId, gapType })
      .then(() => setState("done"))
      .catch(() => setState("idle"));
    setTimeout(() => setPopover(null), 900);
  }

  return (
    <div ref={containerRef} className="relative">
      {children}
      {popover && (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-1.5 py-1 shadow-md"
          style={{ left: popover.x, top: popover.y - 6 }}
        >
          {state === "saving" ? (
            <Loader2 className="mx-2 my-1 h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : state === "done" ? (
            <Check className="mx-2 my-1 h-3.5 w-3.5 text-accent" aria-hidden="true" />
          ) : (
            <div className="flex items-center gap-1">
              {gapChoices(skill).map((g, i) => (
                <button
                  key={g}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep the selection alive through the click
                    mark(g);
                  }}
                  className={
                    i === 0
                      ? "rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground"
                      : "rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {LABELS[g]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

实现前先读同目录组件核对 token/间距习惯(如 `bg-surface`、`border-border` 是否为现用 token),按现状调整。

- [x] **Step 3: 接入 drill-runner**

在 `drill-runner.tsx` 里把「题目媒体 + transcript」用浮标包住:找到渲染 `<QuestionMedia …/>` 的位置和 `showAnswer && q.transcript` 块(约 :334),将两处共同的父级区域(或分别)包为:

```tsx
<MarkGapFloater skill={skill} questionId={q.id}>
  …existing QuestionMedia / transcript block…
</MarkGapFloater>
```

只动 drill-runner;exam-runner 本期不加(考试中不该分心标词)。

- [x] **Step 4: 类型检查 + 浏览器验证**

Run: `npx tsc --noEmit && npm run lint`
浏览器(用户 dev server 常开在 :3000):听力题选中 transcript 里一个词 → 三键浮标,默认高亮 Mal entendu;阅读题 → 两键。点一下出 ✓,查库确认 gap 行 + occurrence 行(带 tcf_question_id)。移动端宽度(responsive 模式)确认浮标不溢出。结果截图/查询贴给用户。

- [x] **Step 5: Commit**

```bash
git add src/lib/actions/vocab-gaps.ts src/app/tcf/_components/mark-gap-floater.tsx src/app/tcf/_components/drill-runner.tsx
git commit -m "feat(tcf): mark unknown words into the vocab gap profile"
```

---

## Task 5: 复习队列数据层

**Files:**
- Modify: `src/lib/actions/vocab-gaps.ts`(追加查询与复习 actions)

**Interfaces:**
- Consumes: Task 2 `gradeGap`;`vocabularyGaps`、`vocabularyLookups`
- Produces:
  - `type GapReviewCard = { gapId: string; lemma: string; surface: string; gapType: VocabGapType; box: number; translation: string; sentenceContext: string | null; examples: string[]; choices: string[] /* recognition: 4 translations; listening: 4 lemmas; production: [] */; answerIndex: number /* -1 for production */ }`
  - `getDueGapCards(limit?: number): Promise<GapReviewCard[]>`
  - `gradeGapReview(gapId: string, correct: boolean): Promise<{ box: number; status: VocabGapStatus }>`
  - `setGapStatus(gapId: string, status: VocabGapStatus): Promise<void>`(置 `active` 时同时重置 box 1 / dueAt now——供管理列表「Réactiver」用)
  - `changeGapType(gapId: string, gapType: VocabGapType): Promise<void>`
  - `type GapListRow = { gapId: string; lemma: string; translation: string | null; gapType: VocabGapType; status: VocabGapStatus; box: number; dueAt: Date }`
  - `listGaps(): Promise<GapListRow[]>`

- [x] **Step 1: 实现**

要点(完整写出,不省略):

```ts
import { and, asc, eq, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vocabularyGaps, vocabularyLookups, type VocabGapType, type VocabGapStatus } from "@/lib/db/schema";
import { gradeGap } from "@/lib/vocabulary/gaps";
import { revalidatePath } from "next/cache";

const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);

export async function getDueGapCards(limit = 20): Promise<GapReviewCard[]> {
  const rows = await db
    .select({
      gapId: vocabularyGaps.id,
      lemma: vocabularyGaps.lemma,
      gapType: vocabularyGaps.gapType,
      box: vocabularyGaps.box,
      surface: vocabularyLookups.surface,
      translation: vocabularyLookups.translation,
      sentenceContext: vocabularyLookups.sentenceContext,
      inContext: vocabularyLookups.inContext,
      examples: vocabularyLookups.examples,
    })
    .from(vocabularyGaps)
    .innerJoin(vocabularyLookups, eq(vocabularyGaps.lemma, vocabularyLookups.lemma))
    .where(and(eq(vocabularyGaps.status, "active"), lte(vocabularyGaps.dueAt, new Date())))
    .orderBy(asc(vocabularyGaps.dueAt))
    .limit(limit);

  // Distractor pool: 30 random other entries with a translation.
  const pool = await db
    .select({ lemma: vocabularyLookups.lemma, translation: vocabularyLookups.translation })
    .from(vocabularyLookups)
    .where(sql`${vocabularyLookups.translation} is not null`)
    .orderBy(sql`random()`)
    .limit(30);

  return rows
    .filter((r) => r.translation) // a card without a translation can't be graded
    .map((r) => {
      const others = pool.filter((p) => p.lemma !== r.lemma);
      const base = {
        gapId: r.gapId, lemma: r.lemma, surface: r.surface, gapType: r.gapType, box: r.box,
        translation: r.translation!, sentenceContext: r.sentenceContext ?? r.inContext,
        examples: (r.examples as string[]) ?? [],
      };
      if (r.gapType === "production") {
        return { ...base, choices: [], answerIndex: -1 };
      }
      const distractors = shuffle(others).slice(0, 3);
      const options =
        r.gapType === "recognition"
          ? [r.translation!, ...distractors.map((d) => d.translation!)]
          : [r.lemma, ...distractors.map((d) => d.lemma)]; // listening: pick the word you heard
      const order = shuffle(options.map((_, i) => i));
      return { ...base, choices: order.map((i) => options[i]), answerIndex: order.indexOf(0) };
    });
}
```

(实现时把 `…` 展开为与下方相同的完整字段;计划里为免重复省略,**代码中不得省略**。)

其余 action 直白:`gradeGapReview` 转发 `gradeGap`;`setGapStatus` / `changeGapType` 是单行 update——`changeGapType` 先查 (lemma, 新type) 是否已存在,存在则删当前行(合并),否则 update;二者结尾 `revalidatePath("/vocabulary/review")`。`listGaps` 全量 join 返回 `GapListRow[]`,`status != 'dismissed'` 的排前、按 dueAt 升序。

- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit && npm run lint`

- [x] **Step 3: Commit**

```bash
git add src/lib/actions/vocab-gaps.ts
git commit -m "feat(vocab): review queue queries and gap management actions"
```

---

## Task 6: 复习页 `/vocabulary/review`

**Files:**
- Create: `src/app/(main)/vocabulary/review/page.tsx`(async server component)
- Create: `src/app/(main)/vocabulary/review/_components/gap-review-runner.tsx`(client)
- Modify: `src/app/(main)/vocabulary/page.tsx`(页头加入口链接 + 到期数)

**Interfaces:**
- Consumes: Task 5 全部 actions/类型
- Produces: 页面路由;无代码级导出

- [x] **Step 1: page.tsx**

```tsx
import { getDueGapCards } from "@/lib/actions/vocab-gaps";
import { GapReviewRunner } from "./_components/gap-review-runner";

export default async function VocabReviewPage() {
  const cards = await getDueGapCards();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-2xl">Révision du vocabulaire</h1>
      <div className="mt-6">
        <GapReviewRunner initialCards={cards} />
      </div>
    </main>
  );
}
```

页面骨架(标题层级、容器宽度)以 `/vocabulary/page.tsx` 现状为准,先读再写。

- [x] **Step 2: GapReviewRunner**

Client 组件,状态机:`cards[]` + `currentIndex` + `answered: { correct: boolean } | null` + `summary { right, wrong, promoted }`。行为:

- **recognition 卡**:大号 `font-serif` 显示 `surface`,下方 4 个选项按钮(`choices`),点选 → 对错着色(复用 TCF OptionList 的视觉语言,读 `option-list.tsx` 抄其 correct/wrong 样式 token)→ 调 `gradeGapReview(gapId, chosen === answerIndex)`(await,失败 toast 且不推进)→ 显示正确释义 + 例句 → 「Suivant」
- **listening 卡**:进卡即播 `speechSynthesis`:`const u = new SpeechSynthesisUtterance(card.lemma); u.lang = "fr-FR"; speechSynthesis.speak(u);` 提供重听按钮(🔊)。选项为 4 个法语词。判定同上。组件挂载时 `"speechSynthesis" in window` 检查,不支持则该卡降级为 recognition 形式(显示词)。
- **production 卡**:显示中文 `translation` + 挖空例句(`sentenceContext` 里把 `surface`/`lemma` 首次出现替换为 `____`;两者都找不到则只显示释义)。`<input>` 提交,判定:`norm(input) === norm(lemma) || norm(input) === norm(surface)`(norm = lowercase + NFC + trim,client 侧内联实现)。答错显示正确词。
- 每卡右上角两个小操作:「Acquis」(`setGapStatus(gapId, "mastered")` 后跳下一张)、「Retirer」(`setGapStatus(gapId, "dismissed")` 后跳下一张)。
- 全部做完 → 汇总卡(`x justes · y fautes · z promues`)+ 返回链接。空队列 → 「Rien à réviser aujourd'hui」。
- 键盘:A–D 选选项、Enter 提交/下一张(参考 `use-question-keyboard-nav.ts` 但不必复用——形态不同,内联 `onKeyDown` 即可)。

- [x] **Step 3: vocabulary 页入口**

`/vocabulary/page.tsx` 页头加一个 `Button`(variant 参照现有页面)链接到 `/vocabulary/review`,文案 `Réviser (N)`,N 来自 `getDueGapCards` 的 length(或专门 count 查询,如果页面已有并行数据获取就 Promise.all 进去)。

- [x] **Step 4: 验证**

Run: `npx tsc --noEmit && npm run lint`
浏览器:先用 SQL 把几个 gap 行的 `due_at` 改到过去、覆盖三种类型 → 打开 `/vocabulary/review` → 三种卡都出现且可作答;答对后查库 box+1、due_at 后移;答错回 box 1;「Acquis」「Retirer」生效;听力卡出声。把过程与查库结果贴给用户。

- [x] **Step 5: Commit**

```bash
git add src/app/\(main\)/vocabulary/review/ src/app/\(main\)/vocabulary/page.tsx
git commit -m "feat(vocab): Leitner review queue with per-gap-type cards"
```

---

## Task 7: 缺口词条管理列表

**Files:**
- Create: `src/app/(main)/vocabulary/review/_components/gap-list.tsx`(client)
- Modify: `src/app/(main)/vocabulary/review/page.tsx`(队列下方挂折叠区)

**Interfaces:**
- Consumes: Task 5 `listGaps` / `GapListRow` / `setGapStatus` / `changeGapType`
- Produces: 无导出

- [x] **Step 1: 实现**

page.tsx 改为 `Promise.all([getDueGapCards(), listGaps()])`,列表传给 `<GapList rows={rows} />`,置于 runner 下方 `<details>`(或现有 Collapsible 模式,先看 components/ui 有没有)内,summary 文案 `Tous les mots (N)`。

GapList:表格布局(`font-mono text-xs` 数据列),列 = 词条 / 类型 / box / 状态 / 下次复习;行内操作:类型下拉(3 值,onChange → `changeGapType`)、「Acquis」「Retirer」按钮(dismissed 行显示「Réactiver」→ `setGapStatus(gapId, "active")`,Task 5 已定义其重置 box/dueAt 的语义)。顶部按 gapType 过滤的 chip 组(客户端过滤,不发请求)。

- [x] **Step 2: 验证 + Commit**

Run: `npx tsc --noEmit && npm run lint`;浏览器操作每个行内动作各一次并查库确认。

```bash
git add src/app/\(main\)/vocabulary/review/
git commit -m "feat(vocab): self-serve gap list with type/status controls"
```

---

## Task 8: TCF 重刷加权

**Files:**
- Modify: `src/lib/actions/tcf.ts`(`getTcfScheduledDrillQuestions`,约 :482-518)

**Interfaces:**
- Consumes: `vocabularyGaps`、`vocabularyOccurrences`(schema)
- Produces: 无新导出(排序内部变化)

- [x] **Step 1: 取「带活跃缺口的题目 id」**

在 `getTcfScheduledDrillQuestions` 的 `Promise.all` 里并行加一个查询:

```ts
const gapQuestionRows = await db
  .selectDistinct({ questionId: vocabularyOccurrences.tcfQuestionId })
  .from(vocabularyOccurrences)
  .innerJoin(vocabularyGaps, eq(vocabularyOccurrences.lemma, vocabularyGaps.lemma))
  .where(and(eq(vocabularyGaps.status, "active"), isNotNull(vocabularyOccurrences.tcfQuestionId)));
const gapQuestionIds = new Set(gapQuestionRows.map((r) => r.questionId));
```

- [x] **Step 2: 排序注入**

现有 sort 比较器中,`rankDifference` 判定之后、needsReview 时间比较之前,插入同 rank 内的加权:

```ts
const gapBoost = Number(gapQuestionIds.has(b.question.id)) - Number(gapQuestionIds.has(a.question.id));
if (kind !== "all" && gapBoost !== 0) return gapBoost;
```

(`kind === "all"` 保持完全不重排——沿用现有注释的理由。)

- [x] **Step 3: 验证 + Commit**

Run: `npx tsc --noEmit && npm run lint`
真实验证:挑一道未做过的题在其 transcript 标记一个词(Task 4 入口)→ 进入该 level 的 drill(10 题模式)→ 确认这道题排到了同为 unseen 的题之前。贴排序前后对比。

```bash
git add src/lib/actions/tcf.ts
git commit -m "feat(tcf): boost drill questions that carry active vocab gaps"
```

---

## Task 9: 写作任务注入 + 用对即过盒

**Files:**
- Modify: `src/lib/db/schema.ts`(`writingTasks` 加列)+ 生成迁移
- Modify: `src/lib/ai/task.ts`(prompt 注入)
- Modify: `src/lib/actions/tasks.ts`(取词、存列、批改回灌)
- Modify: `src/app/(main)/practice/_components/task-card.tsx`(目标词 chips)

**Interfaces:**
- Consumes: Task 2 `gradeGap`;`vocabularyGaps` / `vocabularyAliases`
- Produces: `writingTasks.targetLemmas: string[] | null`(jsonb 列 `target_lemmas`);`GenerateTaskOptions.targetLemmas?: string[]`

- [x] **Step 1: schema 加列 + 迁移**

`writingTasks` 表加:`targetLemmas: jsonb("target_lemmas").$type<string[]>(),`
Run: `npm run db:generate`(核对 SQL 只有一条 ALTER TABLE ADD COLUMN)→ `npm run db:init`

- [x] **Step 2: 取词函数**

`src/lib/actions/vocab-gaps.ts` 加(非页面 action,供 tasks.ts 调):

```ts
/** Top production gaps for task injection: lowest box first, then oldest. */
export async function getProductionGapLemmas(limit = 5): Promise<string[]> {
  const rows = await db
    .select({ lemma: vocabularyGaps.lemma })
    .from(vocabularyGaps)
    .where(and(eq(vocabularyGaps.status, "active"), eq(vocabularyGaps.gapType, "production")))
    .orderBy(asc(vocabularyGaps.box), asc(vocabularyGaps.createdAt))
    .limit(limit);
  return rows.map((r) => r.lemma);
}
```

- [x] **Step 3: prompt 注入**

`ai/task.ts`:`GenerateTaskOptions` 加 `targetLemmas?: string[]`;system prompt 组装处(`buildProfileSystemBlock` 同层)追加:

```ts
function buildTargetLemmasBlock(lemmas: string[]): string {
  return `\n\nDesign the task so it naturally elicits these French words the student cannot yet produce: ${lemmas.join(", ")}. Weave the topic and instructions so using them feels organic — do not just list them as a requirement.`;
}
```

`tasks.ts` 的两个 `generateTask` 调用点(`createTask` 约 :48 与 `writeFromTcfPassage` 约 :149):调用前 `const targetLemmas = await getProductionGapLemmas();`,传入 opts,insert `writingTasks` 时带 `targetLemmas: targetLemmas.length ? targetLemmas : null`。

- [x] **Step 4: chips 展示**

`task-card.tsx` 仿 `targetGrammar` 块(:51-58 现有模式),在其后渲染 `task.targetLemmas` 的 chips,视觉用现有 Chip 组件、`text-accent` 区分,标题 `Mots à employer`。

- [x] **Step 5: 批改回灌**

`persistFeedback`(Task 3 已在此处)再加:取 submission 关联 task 的 `targetLemmas`,对每个 lemma——若 `norm(content)` 中出现该 lemma 或其任一 alias(查 `vocabularyAliases` where lemma = X 的 surfaces),且该词未落在任何 Vocabulary 类错误的 `original` 里——则查其 production gap 行并 `gradeGap(gapId, true)`。整段包 try/catch,失败仅 console.error。

- [x] **Step 6: 验证 + Commit**

Run: `npx tsc --noEmit && npm run lint`
真实验证:确保库里有 ≥2 个 production 缺口 → 生成一个新写作任务 → 任务卡显示 Mots à employer chips、prompt 里含目标词(dev log 或直接看任务文本是否围绕它们)→ 提交一篇用上其中一个词的短文 → 批改完成后查库确认该 gap box+1。全过程截图/查询贴给用户。

```bash
git add src/lib/db/schema.ts drizzle/ src/lib/ai/task.ts src/lib/actions/tasks.ts src/lib/actions/vocab-gaps.ts src/app/\(main\)/practice/_components/task-card.tsx
git commit -m "feat(practice): inject production-gap words into writing tasks"
```

---

## 验证总表(每期收尾必跑)

- P1(Task 1–4):三条捕获路径各留一条真实 gap 行的 SQL 证据
- P2(Task 5–7):三种卡型作答 + box/due 变化 + 管理操作的库状态
- P3(Task 8–9):加权排序对比 + 注入任务全链路(生成→chips→用词→box+1)
- 全程 `npx tsc --noEmit && npm run lint` 干净;commit 无 AI 尾注
