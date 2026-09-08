# TCF Speaking Practice — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 口语练习 Phase 1 — 题库导入、个人档案、AI script 生成、朗读练习（浏览器录音 → Azure 逐句发音评分 → 单词级着色）。

**Architecture:** 4 张新表（`speaking_prompts/scripts/sessions/turns`）；音频上传走 route handler `/api/speaking/assess`（server action 有 1MB body 限制）；Azure Speech 同时返回发音评分与转写，OpenAI 只做 script 文本生成。浏览器端直接采集 16kHz PCM 并封 WAV 头，服务端不需要 ffmpeg。

**Tech Stack:** Next.js 16.2.4 (App Router) · Drizzle + postgres-js · OpenAI SDK · `microsoft-cognitiveservices-speech-sdk`（新增依赖）· Tailwind 4 语义 token

**Historical spec:** `docs/archive/specs/2026-07-03-tcf-speaking-practice-design.md`

## Global Constraints

- **Next.js 16 有破坏性变更**：写任何 page/route 代码前先读 `node_modules/next/dist/docs/` 对应章节（route handler 见 `01-app/03-api-reference/03-file-conventions/route.md`；`params` 是 **Promise**，必须 `await`）。
- 所有 DB 访问走 server actions（`src/lib/actions/`）；唯一例外是本计划的音频 route handler。Drizzle 全异步，禁用 `.run()/.get()/.all()`。
- 颜色只用语义 token（`text-muted-foreground`、`bg-surface`、`border-border`、`text-accent`、`text-success`、`text-danger`）；UI 文案用英语/法语（与现有页面一致，不用中文）。
- 单用户应用，无鉴权，无多用户列。
- **项目无测试套件**（CLAUDE.md 明确）：每个任务以手动/CLI 验证步骤收尾，纯函数用一次性 tsx 脚本验证（放 scratchpad，不提交）。
- 新环境变量：`AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION`、`OPENAI_MODEL_SPEAKING`（默认 `gpt-4o`）。
- 发音评估语言用 `fr-FR`（TCF 考标准法语；Azure 发音评估对 fr-FR 支持最完整）。
- 提交信息遵循仓库惯例：`feat(speaking): …` / `chore: …`。

---

### Task 1: Schema — 4 张 speaking 表 + 迁移

**Files:**
- Modify: `src/lib/db/schema.ts`（文件末尾追加）
- Generated: `drizzle/00XX_*.sql`（由 drizzle-kit 生成）

**Interfaces:**
- Produces: `speakingPrompts`, `speakingScripts`, `speakingSessions`, `speakingTurns` 表对象及类型 `SpeakingPrompt`, `SpeakingScript`, `SpeakingSession`, `SpeakingTurn`, `TurnAssessment`, `SessionScores`；后续所有任务从 `@/lib/db/schema` 导入。

- [ ] **Step 1: 在 `src/lib/db/schema.ts` 末尾追加**

```ts
/* ------------------------------------------------------------------ */
/*  Speaking — TCF Expression orale practice                           */
/* ------------------------------------------------------------------ */

export const speakingModeEnum = pgEnum("speaking_mode", ["script_practice", "simulation"]);
export const speakingSessionStatusEnum = pgEnum("speaking_session_status", [
  "active",
  "completed",
  "abandoned",
]);
export const speakingRoleEnum = pgEnum("speaking_role", ["examiner", "user"]);

export const speakingPrompts = pgTable(
  "speaking_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tâche number: 1 (entretien dirigé) | 2 (interaction) | 3 (point de vue) */
    task: integer("task").notNull(),
    /** Question / scenario card / opinion topic, in French */
    prompt: text("prompt").notNull(),
    /** Extra context, e.g. which role the examiner plays (Tâche 2) */
    context: text("context"),
    /** Source annotation, e.g. "test 12" */
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("speaking_prompts_task_prompt_idx").on(t.task, t.prompt)],
);

export type SpeakingPrompt = typeof speakingPrompts.$inferSelect;

export const speakingScripts = pgTable("speaking_scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => speakingPrompts.id, { onDelete: "cascade" }),
  /** AI-generated reference script; user-editable */
  content: text("content").notNull(),
  /** speaking_profile value used at generation time */
  profileSnapshot: text("profile_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SpeakingScript = typeof speakingScripts.$inferSelect;

/** Azure word-level detail stored per user turn */
export type TurnAssessment = {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronunciationScore: number;
  words: {
    word: string;
    accuracyScore: number;
    errorType: string;
    phonemes: { phoneme: string; accuracyScore: number }[];
  }[];
};

/** Aggregated per-session scores (0–100) */
export type SessionScores = {
  accuracy: number;
  fluency: number;
  completeness: number;
  overall: number;
};

export const speakingSessions = pgTable("speaking_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => speakingPrompts.id, { onDelete: "cascade" }),
  mode: speakingModeEnum("mode").notNull(),
  status: speakingSessionStatusEnum("status").notNull().default("active"),
  /** End-of-session report (Phase 2: GPT content feedback) */
  report: jsonb("report"),
  scores: jsonb("scores").$type<SessionScores>(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type SpeakingSession = typeof speakingSessions.$inferSelect;

export const speakingTurns = pgTable("speaking_turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => speakingSessions.id, { onDelete: "cascade" }),
  /** Script practice: sentence index. Simulation: dialogue turn order. */
  orderIndex: integer("order_index").notNull(),
  role: speakingRoleEnum("role").notNull(),
  /** Examiner line, or user speech transcript from Azure */
  text: text("text").notNull(),
  /** Relative path, e.g. /media/speaking/<sessionId>/003.wav */
  audioPath: text("audio_path"),
  /** Azure word-level assessment — user turns only */
  assessment: jsonb("assessment").$type<TurnAssessment>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SpeakingTurn = typeof speakingTurns.$inferSelect;
```

- [ ] **Step 2: 生成并应用迁移**

```bash
npm run db:generate   # 生成 drizzle/00XX_*.sql — 检查 SQL 只含 4 张新表 + 3 个 enum
npm run db:init
```

Expected: `db:init` 输出应用了一条新迁移，无报错。

- [ ] **Step 3: 验证表存在**

```bash
npx tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' }); config({ path: '.env' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const rows = await sql\`select table_name from information_schema.tables where table_name like 'speaking_%' order by 1\`;
console.log(rows.map(r => r.table_name));
await sql.end();
"
```

Expected: `[ 'speaking_prompts', 'speaking_scripts', 'speaking_sessions', 'speaking_turns' ]`

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(speaking): add speaking_prompts/scripts/sessions/turns tables"
```

---

### Task 2: 题库 JSON 格式 + 导入脚本

**Files:**
- Create: `data/tcf-speaking.json`
- Create: `scripts/import-tcf-speaking.ts`
- Modify: `package.json`（scripts 加一行）

**Interfaces:**
- Consumes: Task 1 的 `speakingPrompts`
- Produces: `npm run import:speaking` 命令；`data/tcf-speaking.json` 是用户后续维护题库的唯一入口（幂等，可反复重跑）

- [ ] **Step 1: 创建 `data/tcf-speaking.json` 样例题库**（用户之后用真实题库替换/扩充此文件，格式不变）

```json
[
  {
    "task": 1,
    "prompt": "Parlez-moi de vous : votre travail, votre famille, vos loisirs.",
    "context": null,
    "source": "sample"
  },
  {
    "task": 2,
    "prompt": "Vous voulez vous inscrire à un cours de natation. Vous posez des questions à l'employé de la piscine (horaires, tarifs, niveau requis).",
    "context": "L'examinateur joue l'employé de la piscine.",
    "source": "sample"
  },
  {
    "task": 3,
    "prompt": "Certaines personnes pensent qu'il vaut mieux vivre en ville qu'à la campagne. Qu'en pensez-vous ?",
    "context": null,
    "source": "sample"
  }
]
```

- [ ] **Step 2: 创建 `scripts/import-tcf-speaking.ts`**

```ts
/**
 * Import TCF speaking prompts from data/tcf-speaking.json.
 *
 *   npm run import:speaking
 *
 * Idempotent: upserts on (task, prompt) — re-running updates context/source,
 * never duplicates, never deletes rows missing from the JSON.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { speakingPrompts } from "../src/lib/db/schema";

type Entry = { task: number; prompt: string; context?: string | null; source?: string | null };

async function main() {
  const file = path.join(process.cwd(), "data", "tcf-speaking.json");
  const entries: Entry[] = JSON.parse(readFileSync(file, "utf-8"));

  const bad = entries.filter((e) => ![1, 2, 3].includes(e.task) || !e.prompt?.trim());
  if (bad.length > 0) {
    console.error(`✗ ${bad.length} invalid entries (task must be 1|2|3, prompt required):`, bad);
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  for (const e of entries) {
    await db
      .insert(speakingPrompts)
      .values({
        task: e.task,
        prompt: e.prompt.trim(),
        context: e.context?.trim() || null,
        source: e.source?.trim() || null,
      })
      .onConflictDoUpdate({
        target: [speakingPrompts.task, speakingPrompts.prompt],
        set: {
          context: sql`excluded.context`,
          source: sql`excluded.source`,
        },
      });
  }

  const counts = await client`
    select task, count(*)::int as n from speaking_prompts group by task order by task`;
  console.log("✓ Imported. Prompts per tâche:", counts.map((r) => `T${r.task}=${r.n}`).join(" "));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: `package.json` scripts 加**

```json
"import:speaking": "tsx scripts/import-tcf-speaking.ts"
```

- [ ] **Step 4: 验证幂等**

```bash
npm run import:speaking   # Expected: ✓ Imported. Prompts per tâche: T1=1 T2=1 T3=1
npm run import:speaking   # 再跑一次，Expected: 数字不变（无重复）
```

- [ ] **Step 5: Commit**

```bash
git add data/tcf-speaking.json scripts/import-tcf-speaking.ts package.json
git commit -m "feat(speaking): question bank JSON format + idempotent import script"
```

---

### Task 3: Settings 口语档案

**Files:**
- Modify: `src/lib/actions/settings.ts`（追加两个函数）
- Create: `src/app/(main)/settings/_components/speaking-profile-editor.tsx`
- Modify: `src/app/(main)/settings/page.tsx`（加一个 section）

**Interfaces:**
- Produces: `getSpeakingProfile(): Promise<string>`、`setSpeakingProfile(text: string): Promise<void>`（Task 4 的 script 生成会调 `getSpeakingProfile`）

- [ ] **Step 1: `src/lib/actions/settings.ts` 末尾追加**（沿用文件内已有的 `userSettings` 键值模式）

```ts
/* ------------------------------------------------------------------ */
/*  getSpeakingProfile / setSpeakingProfile                            */
/* ------------------------------------------------------------------ */

export async function getSpeakingProfile(): Promise<string> {
  const row = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.key, "speaking_profile"))
    .limit(1)
    .then((r) => r[0] ?? null);
  return row?.value ?? "";
}

export async function setSpeakingProfile(text: string): Promise<void> {
  await db
    .insert(userSettings)
    .values({ key: "speaking_profile", value: text })
    .onConflictDoUpdate({
      target: userSettings.key,
      set: { value: text, updatedAt: new Date() },
    });
  revalidatePath("/settings");
}
```

- [ ] **Step 2: 创建 `src/app/(main)/settings/_components/speaking-profile-editor.tsx`**

```tsx
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
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={isPending || value.trim() === initialValue.trim()}>
          {isPending ? "Saving…" : "Save profile"}
        </Button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
    </div>
  );
}
```

注意：先看 `src/components/ui/button.tsx` 确认 `size` 变体名（若无 `sm` 用默认）。

- [ ] **Step 3: `src/app/(main)/settings/page.tsx` 修改**

顶部 import 加：

```tsx
import { Mic } from "lucide-react";
import { getSpeakingProfile } from "@/lib/actions/settings";
import { SpeakingProfileEditor } from "./_components/speaking-profile-editor";
```

`Promise.all` 行改为：

```tsx
const [status, cefrLevel, speakingProfile] = await Promise.all([
  testApiKey(),
  getCefrLevel(),
  getSpeakingProfile(),
]);
```

CEFR section 之后（`</section>` 后、收尾 `</div>` 前）追加：

```tsx
<section className="rounded-2xl border border-border bg-surface p-6 space-y-5 mt-6">
  <div className="flex items-center gap-2">
    <Mic className="h-4 w-4 text-muted-foreground" />
    <h2 className="font-medium text-sm">Speaking Profile</h2>
  </div>
  <p className="text-xs text-muted-foreground">
    Personal background used to generate TCF speaking scripts — job, city, family,
    immigration goals, hobbies, go-to anecdotes. Any language.
  </p>
  <SpeakingProfileEditor initialValue={speakingProfile} />
</section>
```

- [ ] **Step 4: 浏览器验证**

启动 dev server（用 preview 工具或 `npm run dev`），打开 `/settings`：填入档案 → Save → 刷新页面内容保留。

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/settings.ts src/app/\(main\)/settings/
git commit -m "feat(speaking): speaking profile setting (free-text, user_settings)"
```

---

### Task 4: Script 生成 — AI 模块 + server actions

**Files:**
- Modify: `src/lib/ai/client.ts`（MODELS 加 `speaking`）
- Create: `src/lib/ai/speaking-script.ts`
- Create: `src/lib/actions/speaking.ts`

**Interfaces:**
- Consumes: `getSpeakingProfile`（Task 3）、`speakingPrompts/speakingScripts`（Task 1）
- Produces:
  - `generateSpeakingScript(prompt: SpeakingPrompt, profile: string): Promise<string>`（纯 AI 函数）
  - server actions：`generateScript(promptId: string): Promise<SpeakingScript>`、`updateScript(scriptId: string, content: string): Promise<void>`、`getPromptWithScript(promptId: string): Promise<{ prompt: SpeakingPrompt; script: SpeakingScript | null }>`、`listPromptsWithStats(): Promise<PromptWithStats[]>`，其中 `type PromptWithStats = SpeakingPrompt & { sessionCount: number; bestScore: number | null }`

- [ ] **Step 1: `src/lib/ai/client.ts` 的 MODELS 加一行**

```ts
speaking: process.env.OPENAI_MODEL_SPEAKING ?? "gpt-4o",
```

- [ ] **Step 2: 创建 `src/lib/ai/speaking-script.ts`**

```ts
import type { SpeakingPrompt } from "@/lib/db/schema";
import { openai, MODELS } from "./client";

const TASK_GUIDANCE: Record<number, string> = {
  1: `Tâche 1 (entretien dirigé, ~2 min): write first-person spoken answers to the personal questions in the prompt. Natural conversational French, complete sentences a B1 learner can memorize and deliver aloud.`,
  2: `Tâche 2 (interaction, ~5 min): the CANDIDATE asks the questions. Write a one-sentence greeting/opening, then 8–10 varied questions the candidate should ask (mix est-ce que / inversion / intonation forms), then a one-sentence polite closing.`,
  3: `Tâche 3 (point de vue, ~4.5 min): write a structured spoken opinion — brief intro stating the position, 2–3 arguments each backed by a concrete example (draw examples from the student's personal profile where natural), short conclusion. ~250–300 words.`,
};

export async function generateSpeakingScript(
  prompt: SpeakingPrompt,
  profile: string,
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODELS.speaking,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You write reference scripts for the TCF Canada speaking test (Expression orale), for a B1-level learner preparing to deliver them aloud.

${TASK_GUIDANCE[prompt.task]}

Rules:
- Spoken register, natural rhythm, no literary vocabulary.
- Weave in the student's real personal details from their profile so the script sounds authentic and is easy to remember.
- Output ONLY the French script text. No headings, no markdown, no translations, no commentary.
- One sentence per line (each line will be practiced and scored separately).`,
      },
      {
        role: "user",
        content: `Prompt (Tâche ${prompt.task}): ${prompt.prompt}${
          prompt.context ? `\nContext: ${prompt.context}` : ""
        }

Student profile:
${profile || "(no profile provided — use a plausible generic newcomer-to-Canada persona)"}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No script returned from OpenAI");
  return content;
}
```

- [ ] **Step 3: 创建 `src/lib/actions/speaking.ts`**

```ts
"use server";

import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  speakingPrompts,
  speakingScripts,
  speakingSessions,
  type SpeakingPrompt,
  type SpeakingScript,
} from "@/lib/db/schema";
import { generateSpeakingScript } from "@/lib/ai/speaking-script";
import { getSpeakingProfile } from "./settings";

export type PromptWithStats = SpeakingPrompt & {
  sessionCount: number;
  bestScore: number | null;
};

export async function listPromptsWithStats(): Promise<PromptWithStats[]> {
  const rows = await db
    .select({
      prompt: speakingPrompts,
      sessionCount: sql<number>`count(${speakingSessions.id})::int`,
      bestScore: sql<number | null>`max((${speakingSessions.scores}->>'overall')::numeric)::int`,
    })
    .from(speakingPrompts)
    .leftJoin(
      speakingSessions,
      sql`${speakingSessions.promptId} = ${speakingPrompts.id} and ${speakingSessions.status} = 'completed'`,
    )
    .groupBy(speakingPrompts.id)
    .orderBy(speakingPrompts.task, speakingPrompts.createdAt);

  return rows.map((r) => ({ ...r.prompt, sessionCount: r.sessionCount, bestScore: r.bestScore }));
}

export async function getPromptWithScript(
  promptId: string,
): Promise<{ prompt: SpeakingPrompt; script: SpeakingScript | null }> {
  const prompt = await db
    .select()
    .from(speakingPrompts)
    .where(eq(speakingPrompts.id, promptId))
    .limit(1)
    .then((r) => r[0]);
  if (!prompt) throw new Error(`Speaking prompt not found: ${promptId}`);

  const script = await db
    .select()
    .from(speakingScripts)
    .where(eq(speakingScripts.promptId, promptId))
    .orderBy(desc(speakingScripts.createdAt))
    .limit(1)
    .then((r) => r[0] ?? null);

  return { prompt, script };
}

export async function generateScript(promptId: string): Promise<SpeakingScript> {
  const { prompt } = await getPromptWithScript(promptId);
  const profile = await getSpeakingProfile();
  const content = await generateSpeakingScript(prompt, profile);

  const [script] = await db
    .insert(speakingScripts)
    .values({ promptId, content, profileSnapshot: profile || null })
    .returning();

  revalidatePath(`/speaking/${promptId}/script`);
  return script;
}

export async function updateScript(scriptId: string, content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Script content cannot be empty");
  const [row] = await db
    .update(speakingScripts)
    .set({ content: trimmed })
    .where(eq(speakingScripts.id, scriptId))
    .returning({ promptId: speakingScripts.promptId });
  if (row) revalidatePath(`/speaking/${row.promptId}/script`);
}
```

- [ ] **Step 4: CLI 验证 script 生成**（需 `OPENAI_API_KEY`）

```bash
npx tsx -e "
import { config } from 'dotenv';
config({ path: '.env.local' }); config({ path: '.env' });
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { speakingPrompts } from './src/lib/db/schema';
import { generateSpeakingScript } from './src/lib/ai/speaking-script';
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);
const [p] = await db.select().from(speakingPrompts).limit(1);
const script = await generateSpeakingScript(p, 'Je suis développeuse, je viens de Chine, je vis à Montréal. Objectif: résidence permanente.');
console.log(script);
await client.end();
"
```

Expected: 输出法语 script，每行一句，内容引用了档案里的信息（développeuse/Montréal）。若失败检查 `OPENAI_API_KEY`。
（注：`src/lib/ai/speaking-script.ts` 用了 `@/` 别名，若 tsx 解析失败，验证脚本里临时用相对路径版本 import——不改源文件。）

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/client.ts src/lib/ai/speaking-script.ts src/lib/actions/speaking.ts
git commit -m "feat(speaking): AI script generation + speaking server actions"
```

---

### Task 5: `/speaking` 题库页 + 侧边栏入口

**Files:**
- Create: `src/app/(main)/speaking/page.tsx`
- Create: `src/app/(main)/speaking/_components/prompt-list.tsx`
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `listPromptsWithStats`（Task 4）
- Produces: 路由 `/speaking`；列表项链接到 `/speaking/[promptId]/script`（Task 8 实现该页）

- [ ] **Step 1: `src/components/sidebar.tsx`** — import 加 `Mic`，`NAV_ITEMS` 里 TCF 项之后插入：

```ts
{
  href: "/speaking",
  label: "Speaking",
  icon: Mic,
  matcher: (p) => p.startsWith("/speaking"),
},
```

- [ ] **Step 2: 创建 `src/app/(main)/speaking/page.tsx`**

```tsx
export const dynamic = "force-dynamic";

import { listPromptsWithStats } from "@/lib/actions/speaking";
import { PromptList } from "./_components/prompt-list";

export default async function SpeakingPage() {
  const prompts = await listPromptsWithStats();

  return (
    <div className="px-10 py-10 max-w-3xl mx-auto">
      <h1 className="font-serif text-4xl font-semibold tracking-tight mb-1">
        Expression orale
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        TCF Canada speaking practice — generate a personal script, then drill your pronunciation.
      </p>
      <PromptList prompts={prompts} />
    </div>
  );
}
```

- [ ] **Step 3: 创建 `src/app/(main)/speaking/_components/prompt-list.tsx`**（server component，无 "use client"）

```tsx
import Link from "next/link";
import { Mic } from "lucide-react";
import type { PromptWithStats } from "@/lib/actions/speaking";

const TASK_LABELS: Record<number, { title: string; hint: string }> = {
  1: { title: "Tâche 1 — Entretien dirigé", hint: "Questions about yourself · ~2 min · no prep" },
  2: { title: "Tâche 2 — Interaction", hint: "You ask the questions · ~5 min · 2 min prep" },
  3: { title: "Tâche 3 — Point de vue", hint: "Defend an opinion · ~4.5 min · no prep" },
};

export function PromptList({ prompts }: { prompts: PromptWithStats[] }) {
  const byTask = [1, 2, 3].map((task) => ({
    task,
    items: prompts.filter((p) => p.task === task),
  }));

  if (prompts.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        No prompts yet. Add entries to <code className="font-mono">data/tcf-speaking.json</code> and
        run <code className="font-mono">npm run import:speaking</code>.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {byTask.map(({ task, items }) =>
        items.length === 0 ? null : (
          <section key={task}>
            <h2 className="font-medium text-sm mb-1">{TASK_LABELS[task].title}</h2>
            <p className="text-xs text-muted-foreground mb-4">{TASK_LABELS[task].hint}</p>
            <ul className="space-y-2">
              {items.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/speaking/${p.id}/script`}
                    className="flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 hover:border-accent/50 transition-colors"
                  >
                    <span className="flex-1 text-sm leading-snug">{p.prompt}</span>
                    <span className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      {p.sessionCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Mic className="h-3 w-3" />
                          {p.sessionCount}
                        </span>
                      )}
                      {p.bestScore !== null && (
                        <span className="font-mono text-accent">{p.bestScore}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 4: 浏览器验证**

打开 `/speaking`：三个 tâche 分组各显示 1 条样例题；侧边栏 Speaking 高亮。点击题目会 404（Task 8 才建详情页）——预期行为。

- [ ] **Step 5: Commit**

```bash
git add src/app/\(main\)/speaking/ src/components/sidebar.tsx
git commit -m "feat(speaking): prompt browser page + sidebar entry"
```

---

### Task 6: 浏览器 WAV 录音 — 编码器 + hook

**Files:**
- Create: `src/lib/audio/wav-encoder.ts`（纯函数，无浏览器依赖）
- Create: `src/app/(main)/speaking/_components/use-wav-recorder.ts`（client hook）

**Interfaces:**
- Produces:
  - `encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer`
  - `downsampleTo16k(samples: Float32Array, fromRate: number): Float32Array`
  - hook：`useWavRecorder(): { isRecording: boolean; start(): Promise<void>; stop(): Promise<Blob>; error: string | null }`——`stop()` 返回 16kHz 单声道 PCM16 WAV Blob（`audio/wav`），Task 8 直接 append 进 FormData。

- [ ] **Step 1: 创建 `src/lib/audio/wav-encoder.ts`**

```ts
/**
 * Minimal WAV (RIFF) encoder: mono 16-bit PCM.
 * Azure pronunciation assessment wants 16kHz mono PCM16 WAV.
 */

export function downsampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return samples;
  if (fromRate < 16000) throw new Error(`Cannot upsample from ${fromRate}Hz`);
  const ratio = fromRate / 16000;
  const outLength = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    // Average the source window — cheap low-pass to avoid aliasing
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), samples.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = sum / (end - start || 1);
  }
  return out;
}

export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
```

- [ ] **Step 2: 用一次性 tsx 脚本验证编码器**（写到 scratchpad，不提交）

```bash
npx tsx -e "
import { encodeWavPcm16, downsampleTo16k } from './src/lib/audio/wav-encoder';
const sr = 48000;
const sine = new Float32Array(sr); // 1s 440Hz sine
for (let i = 0; i < sr; i++) sine[i] = Math.sin((2 * Math.PI * 440 * i) / sr);
const ds = downsampleTo16k(sine, sr);
console.log('downsampled length:', ds.length, '(expect 16000)');
const wav = Buffer.from(encodeWavPcm16(ds, 16000));
console.log('RIFF:', wav.toString('ascii', 0, 4), '| WAVE:', wav.toString('ascii', 8, 12));
console.log('sampleRate:', wav.readUInt32LE(24), '| channels:', wav.readUInt16LE(22), '| bits:', wav.readUInt16LE(34));
console.log('total bytes:', wav.length, '(expect 44 + 32000 = 32044)');
"
```

Expected: `16000` / `RIFF`/`WAVE` / `16000, 1, 16` / `32044`。

- [ ] **Step 3: 创建 `src/app/(main)/speaking/_components/use-wav-recorder.ts`**

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { downsampleTo16k, encodeWavPcm16 } from "@/lib/audio/wav-encoder";

/**
 * Records mic input and produces a 16kHz mono PCM16 WAV Blob.
 * Uses ScriptProcessorNode (deprecated but universally supported); the
 * capture path is isolated here so swapping to AudioWorklet later only
 * touches this file.
 */
export function useWavRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      processor.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(ctx.destination); // required for onaudioprocess to fire
      ctxRef.current = ctx;
      streamRef.current = stream;
      processorRef.current = processor;
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied — allow it in your browser settings."
          : "Could not start recording.",
      );
      throw err;
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob> => {
    const ctx = ctxRef.current;
    if (!ctx) throw new Error("Not recording");
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const sampleRate = ctx.sampleRate;
    await ctx.close();
    ctxRef.current = null;
    setIsRecording(false);

    const total = chunksRef.current.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total);
    let off = 0;
    for (const c of chunksRef.current) {
      all.set(c, off);
      off += c.length;
    }
    chunksRef.current = [];

    const wav = encodeWavPcm16(downsampleTo16k(all, sampleRate), 16000);
    return new Blob([wav], { type: "audio/wav" });
  }, []);

  return { isRecording, start, stop, error };
}
```

- [ ] **Step 4: Commit**（hook 的浏览器验证并入 Task 8 端到端流程）

```bash
git add src/lib/audio/wav-encoder.ts src/app/\(main\)/speaking/_components/use-wav-recorder.ts
git commit -m "feat(speaking): browser WAV recorder (16kHz PCM16, mic -> Blob)"
```

---

### Task 7: Azure 发音评估 — SDK 封装 + `/api/speaking/assess`

**Files:**
- Create: `src/lib/speech/azure.ts`
- Create: `src/app/api/speaking/assess/route.ts`
- Modify: `.gitignore`（加 `public/media/speaking/`）
- Modify: `package.json`（依赖 `microsoft-cognitiveservices-speech-sdk`）

**Interfaces:**
- Consumes: `speakingTurns`, `TurnAssessment`（Task 1）
- Produces:
  - `assessPronunciation(wav: Buffer, referenceText: string | null): Promise<AssessmentResult>`，`type AssessmentResult = { transcript: string } & TurnAssessment`
  - `POST /api/speaking/assess`，multipart FormData：`audio`（WAV 文件，必填）、`referenceText`（脚本模式传）、`sessionId` + `orderIndex`（都传时落库 turn + 存音频文件）。响应 JSON：`{ transcript, accuracyScore, fluencyScore, completenessScore, pronunciationScore, words, turnId? }`；无语音识别出来时 422 `{ error: "no_speech" }`。

- [ ] **Step 1: 安装依赖 + 环境变量**

```bash
npm install microsoft-cognitiveservices-speech-sdk
```

`.env.local` 加（用户需在 Azure Portal 创建 Speech 资源，区域建议 `canadacentral` 或 `eastus`）：

```
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=canadacentral
```

`.gitignore` 加一行：

```
public/media/speaking/
```

- [ ] **Step 2: 创建 `src/lib/speech/azure.ts`**

```ts
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { TurnAssessment } from "@/lib/db/schema";

export type AssessmentResult = { transcript: string } & TurnAssessment;

/**
 * Runs Azure pronunciation assessment on a 16kHz mono PCM16 WAV buffer.
 * `referenceText` set  → scripted assessment (miscue detection on).
 * `referenceText` null → unscripted assessment (Phase 2 dialogue mode).
 * Assessment language is fr-FR (standard French, per spec).
 * recognizeOnceAsync caps at ~30s of speech — fine for per-sentence use.
 */
export async function assessPronunciation(
  wav: Buffer,
  referenceText: string | null,
): Promise<AssessmentResult | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error("AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set");
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = "fr-FR";

  const audioConfig = sdk.AudioConfig.fromWavFileInput(wav);
  const pronConfig = new sdk.PronunciationAssessmentConfig(
    referenceText ?? "",
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    referenceText !== null, // enableMiscue only makes sense with a reference
  );

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  pronConfig.applyTo(recognizer);

  const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
    recognizer.recognizeOnceAsync(resolve, reject);
  }).finally(() => recognizer.close());

  if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
    return null; // no speech detected / canceled
  }

  const pron = sdk.PronunciationAssessmentResult.fromResult(result);
  const detail = JSON.parse(
    result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult),
  );
  type RawPhoneme = { Phoneme: string; PronunciationAssessment?: { AccuracyScore?: number } };
  type RawWord = {
    Word: string;
    PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
    Phonemes?: RawPhoneme[];
  };
  const words = ((detail?.NBest?.[0]?.Words ?? []) as RawWord[]).map((w) => ({
    word: w.Word,
    accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
    errorType: w.PronunciationAssessment?.ErrorType ?? "None",
    phonemes: (w.Phonemes ?? []).map((p) => ({
      phoneme: p.Phoneme,
      accuracyScore: p.PronunciationAssessment?.AccuracyScore ?? 0,
    })),
  }));

  return {
    transcript: result.text,
    accuracyScore: pron.accuracyScore,
    fluencyScore: pron.fluencyScore,
    completenessScore: pron.completenessScore,
    pronunciationScore: pron.pronunciationScore,
    words,
  };
}
```

- [ ] **Step 3: 创建 `src/app/api/speaking/assess/route.ts`**

```ts
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { speakingTurns } from "@/lib/db/schema";
import { assessPronunciation } from "@/lib/speech/azure";

export async function POST(request: Request) {
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return Response.json({ error: "missing_audio" }, { status: 400 });
  }
  const referenceText = (form.get("referenceText") as string | null)?.trim() || null;
  const sessionId = (form.get("sessionId") as string | null) || null;
  const orderIndexRaw = form.get("orderIndex") as string | null;

  const wav = Buffer.from(await audio.arrayBuffer());

  let result;
  try {
    result = await assessPronunciation(wav, referenceText);
  } catch (err) {
    console.error("[speaking/assess]", err);
    return Response.json({ error: "azure_failed" }, { status: 502 });
  }
  if (!result) {
    return Response.json({ error: "no_speech" }, { status: 422 });
  }

  let turnId: string | undefined;
  if (sessionId && orderIndexRaw !== null) {
    const orderIndex = parseInt(orderIndexRaw, 10);
    const dir = path.join(process.cwd(), "public", "media", "speaking", sessionId);
    await mkdir(dir, { recursive: true });
    const filename = `${String(orderIndex).padStart(3, "0")}.wav`;
    await writeFile(path.join(dir, filename), wav);

    const { transcript, ...assessment } = result;
    const [turn] = await db
      .insert(speakingTurns)
      .values({
        sessionId,
        orderIndex,
        role: "user",
        text: transcript,
        audioPath: `/media/speaking/${sessionId}/${filename}`,
        assessment,
      })
      .returning({ id: speakingTurns.id });
    turnId = turn.id;
  }

  return Response.json({ ...result, turnId });
}
```

- [ ] **Step 4: 用 macOS `say` 合成法语测试音频并 curl 验证**（dev server 需在跑）

```bash
SCRATCH=$(mktemp -d)
say -v Thomas "Bonjour, je m'appelle Marie et j'habite à Montréal." \
  -o "$SCRATCH/test-fr.wav" --data-format=LEI16@16000

curl -s -X POST http://localhost:3000/api/speaking/assess \
  -F "audio=@$SCRATCH/test-fr.wav" \
  -F "referenceText=Bonjour, je m'appelle Marie et j'habite à Montréal." | python3 -m json.tool
```

Expected: JSON 含 `transcript`（接近参考文本）、四个分数均 > 60（TTS 语音发音标准）、`words` 数组每词有 `accuracyScore`。
（若 `say` 无 Thomas 音色：`say -v '?' | grep fr` 找可用法语音色。）

- [ ] **Step 5: 验证错误分支**

```bash
# 空表单 → 400
curl -s -X POST http://localhost:3000/api/speaking/assess | python3 -m json.tool
# 静音 wav → 422 no_speech
say -v Thomas " " -o "$SCRATCH/silence.wav" --data-format=LEI16@16000 2>/dev/null || \
  npx tsx -e "
import { writeFileSync } from 'fs';
import { encodeWavPcm16 } from './src/lib/audio/wav-encoder';
writeFileSync('$SCRATCH/silence.wav', Buffer.from(encodeWavPcm16(new Float32Array(16000), 16000)));
"
curl -s -X POST http://localhost:3000/api/speaking/assess -F "audio=@$SCRATCH/silence.wav" -F "referenceText=Bonjour."
```

Expected: `{"error":"missing_audio"}` 和 `{"error":"no_speech"}`。

- [ ] **Step 6: Commit**

```bash
git add src/lib/speech/azure.ts src/app/api/speaking/assess/route.ts package.json package-lock.json .gitignore
git commit -m "feat(speaking): Azure pronunciation assessment lib + assess route handler"
```

---

### Task 8: 朗读练习页 `/speaking/[promptId]/script`

**Files:**
- Modify: `src/lib/actions/speaking.ts`（追加 session actions）
- Create: `src/lib/speaking/sentences.ts`
- Create: `src/app/(main)/speaking/[promptId]/script/page.tsx`
- Create: `src/app/(main)/speaking/_components/script-workbench.tsx`
- Create: `src/app/(main)/speaking/_components/sentence-row.tsx`
- Create: `src/app/(main)/speaking/_components/word-scores.tsx`

**Interfaces:**
- Consumes: Task 4 actions、Task 6 `useWavRecorder`、Task 7 `POST /api/speaking/assess`、Task 1 类型
- Produces: 完整可用的朗读练习页；新增 actions：`startScriptSession(promptId: string): Promise<string>`（返回 sessionId）、`finishScriptSession(sessionId: string): Promise<SessionScores>`
- 数据流：点击 "Start practice" → `startScriptSession` 建 session → 每句录音 fetch `/api/speaking/assess`（带 `sessionId`+`orderIndex`=句序号，route 落 turn）→ "Finish" → `finishScriptSession` 聚合 turns 平均分写回 session

- [ ] **Step 1: 创建 `src/lib/speaking/sentences.ts`**

```ts
/**
 * Split a generated script into practicable sentences.
 * Scripts are generated one sentence per line, but users can edit freely,
 * so also split on sentence-ending punctuation within a line.
 */
export function splitSentences(script: string): string[] {
  return script
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.!?…])\s+/))
    .map((s) => s.replace(/^[-•\d.)\s]+/, "").trim())
    .filter((s) => s.length > 1);
}
```

- [ ] **Step 2: 验证分句（一次性，不提交）**

```bash
npx tsx -e "
import { splitSentences } from './src/lib/speaking/sentences';
const out = splitSentences('Bonjour à tous. Je m'"'"'appelle Marie !\n- Est-ce que vous avez des questions ? Oui.\n\n');
console.log(JSON.stringify(out, null, 1));
"
```

Expected: 4 句，无空串，bullet 前缀被剥掉。

- [ ] **Step 3: `src/lib/actions/speaking.ts` 追加 session actions**（同文件已 `"use server"`）

顶部 import 增加 `speakingTurns`, `type SessionScores`, `type SpeakingTurn`, `and`：

```ts
export async function startScriptSession(promptId: string): Promise<string> {
  const [session] = await db
    .insert(speakingSessions)
    .values({ promptId, mode: "script_practice" })
    .returning({ id: speakingSessions.id });
  return session.id;
}

export async function finishScriptSession(sessionId: string): Promise<SessionScores> {
  const turns = await db
    .select()
    .from(speakingTurns)
    .where(and(eq(speakingTurns.sessionId, sessionId), eq(speakingTurns.role, "user")))
    .orderBy(speakingTurns.orderIndex, desc(speakingTurns.createdAt));

  // Keep only the latest attempt per sentence (orderIndex)
  const latest = new Map<number, SpeakingTurn>();
  for (const t of turns) {
    if (!latest.has(t.orderIndex)) latest.set(t.orderIndex, t);
  }
  const assessed = [...latest.values()].filter((t) => t.assessment);
  if (assessed.length === 0) throw new Error("No assessed turns in session");

  const avg = (pick: (t: SpeakingTurn) => number) =>
    Math.round(assessed.reduce((sum, t) => sum + pick(t), 0) / assessed.length);

  const scores: SessionScores = {
    accuracy: avg((t) => t.assessment!.accuracyScore),
    fluency: avg((t) => t.assessment!.fluencyScore),
    completeness: avg((t) => t.assessment!.completenessScore),
    overall: avg((t) => t.assessment!.pronunciationScore),
  };

  const [row] = await db
    .update(speakingSessions)
    .set({ status: "completed", scores, completedAt: new Date() })
    .where(eq(speakingSessions.id, sessionId))
    .returning({ promptId: speakingSessions.promptId });

  revalidatePath("/speaking");
  if (row) revalidatePath(`/speaking/${row.promptId}/script`);
  return scores;
}
```

- [ ] **Step 4: 创建 `src/app/(main)/speaking/[promptId]/script/page.tsx`**（注意 Next 16 `params` 是 Promise）

```tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPromptWithScript } from "@/lib/actions/speaking";
import { ScriptWorkbench } from "../../_components/script-workbench";

export default async function ScriptPracticePage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;
  const { prompt, script } = await getPromptWithScript(promptId);

  return (
    <div className="px-10 py-10 max-w-5xl mx-auto">
      <Link
        href="/speaking"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Expression orale
      </Link>
      <p className="text-xs uppercase tracking-wider text-subtle-foreground mb-2">
        Tâche {prompt.task}
      </p>
      <h1 className="font-serif text-2xl font-semibold tracking-tight mb-2">{prompt.prompt}</h1>
      {prompt.context && (
        <p className="text-sm text-muted-foreground mb-6">{prompt.context}</p>
      )}
      <ScriptWorkbench prompt={prompt} initialScript={script} />
    </div>
  );
}
```

- [ ] **Step 5: 创建 `src/app/(main)/speaking/_components/script-workbench.tsx`**（页面主体 client 组件：左 script 面板、右练习面板）

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { Sparkles, Pencil, Check } from "lucide-react";
import type { SpeakingPrompt, SpeakingScript, SessionScores } from "@/lib/db/schema";
import {
  generateScript,
  updateScript,
  startScriptSession,
  finishScriptSession,
} from "@/lib/actions/speaking";
import { splitSentences } from "@/lib/speaking/sentences";
import { Button } from "@/components/ui/button";
import { SentenceRow, type SentenceResult } from "./sentence-row";

type Props = { prompt: SpeakingPrompt; initialScript: SpeakingScript | null };

export function ScriptWorkbench({ prompt, initialScript }: Props) {
  const [script, setScript] = useState(initialScript);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialScript?.content ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, SentenceResult>>({});
  const [finalScores, setFinalScores] = useState<SessionScores | null>(null);
  const [isPending, startTransition] = useTransition();

  const sentences = useMemo(
    () => (script ? splitSentences(script.content) : []),
    [script],
  );

  function handleGenerate() {
    startTransition(async () => {
      const s = await generateScript(prompt.id);
      setScript(s);
      setDraft(s.content);
      setSessionId(null);
      setResults({});
      setFinalScores(null);
    });
  }

  function handleSaveEdit() {
    startTransition(async () => {
      if (script) {
        await updateScript(script.id, draft);
        setScript({ ...script, content: draft });
      }
      setEditing(false);
      setSessionId(null);
      setResults({});
      setFinalScores(null);
    });
  }

  function handleStart() {
    startTransition(async () => {
      setFinalScores(null);
      setResults({});
      setSessionId(await startScriptSession(prompt.id));
    });
  }

  function handleFinish() {
    startTransition(async () => {
      if (!sessionId) return;
      setFinalScores(await finishScriptSession(sessionId));
      setSessionId(null);
    });
  }

  if (!script) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-sm text-muted-foreground mb-5">
          Generate a reference script from your speaking profile, then practice it line by line.
        </p>
        <Button onClick={handleGenerate} disabled={isPending}>
          <Sparkles className="h-4 w-4 mr-2" />
          {isPending ? "Generating…" : "Generate script"}
        </Button>
      </div>
    );
  }

  const scoredCount = Object.keys(results).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Script panel */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-sm">Reference script</h2>
          <div className="flex gap-2">
            {editing ? (
              <Button size="sm" onClick={handleSaveEdit} disabled={isPending}>
                <Check className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Sparkles className="h-3 w-3" /> Regenerate
            </button>
          </div>
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y font-serif"
          />
        ) : (
          <article className="reading-prose text-[15px] whitespace-pre-wrap">
            {script.content}
          </article>
        )}
      </section>

      {/* Practice panel */}
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-sm">
            Read-aloud practice
            {sessionId && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {scoredCount}/{sentences.length} scored
              </span>
            )}
          </h2>
          {sessionId ? (
            <Button size="sm" onClick={handleFinish} disabled={isPending || scoredCount === 0}>
              Finish
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={isPending || sentences.length === 0}>
              Start practice
            </Button>
          )}
        </div>

        {finalScores && (
          <div className="mb-4 rounded-xl bg-accent-soft px-4 py-3 flex gap-6 text-sm">
            {(
              [
                ["Overall", finalScores.overall],
                ["Accuracy", finalScores.accuracy],
                ["Fluency", finalScores.fluency],
                ["Completeness", finalScores.completeness],
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <div className="font-mono text-lg text-accent">{v}</div>
                <div className="text-[11px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        )}

        <ol className="space-y-3">
          {sentences.map((sentence, i) => (
            <SentenceRow
              key={`${script.id}-${i}`}
              index={i}
              sentence={sentence}
              sessionId={sessionId}
              result={results[i] ?? null}
              onResult={(r) => setResults((prev) => ({ ...prev, [i]: r }))}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: 创建 `src/app/(main)/speaking/_components/sentence-row.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import type { TurnAssessment } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { useWavRecorder } from "./use-wav-recorder";
import { WordScores } from "./word-scores";

export type SentenceResult = { transcript: string } & TurnAssessment;

type Props = {
  index: number;
  sentence: string;
  sessionId: string | null;
  result: SentenceResult | null;
  onResult: (r: SentenceResult) => void;
};

export function SentenceRow({ index, sentence, sessionId, result, onResult }: Props) {
  const { isRecording, start, stop, error: micError } = useWavRecorder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    if (!isRecording) {
      await start().catch(() => {});
      return;
    }
    setBusy(true);
    try {
      const blob = await stop();
      const form = new FormData();
      form.append("audio", blob, "sentence.wav");
      form.append("referenceText", sentence);
      if (sessionId) {
        form.append("sessionId", sessionId);
        form.append("orderIndex", String(index));
      }
      const res = await fetch("/api/speaking/assess", { method: "POST", body: form });
      if (res.status === 422) {
        setError("No speech detected — try again, a bit louder.");
        return;
      }
      if (!res.ok) {
        setError("Scoring failed — check server logs and Azure credentials.");
        return;
      }
      onResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const active = sessionId !== null;

  return (
    <li className="rounded-xl border border-border/70 px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          onClick={handleToggle}
          disabled={!active || busy}
          title={active ? (isRecording ? "Stop" : "Record") : "Start practice first"}
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
            isRecording
              ? "bg-danger text-white animate-pulse"
              : active
                ? "bg-accent-soft text-accent hover:bg-accent hover:text-white"
                : "bg-surface-muted text-subtle-foreground",
          )}
        >
          {busy ? (
            <RotateCcw className="h-3.5 w-3.5 animate-spin" />
          ) : isRecording ? (
            <Square className="h-3 w-3" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          {result ? (
            <WordScores sentence={sentence} words={result.words} />
          ) : (
            <p className="font-serif text-[15px] leading-relaxed">{sentence}</p>
          )}
          {result && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-mono text-accent">{Math.round(result.pronunciationScore)}</span>
              {" · "}accuracy {Math.round(result.accuracyScore)} · fluency{" "}
              {Math.round(result.fluencyScore)}
            </p>
          )}
          {(error || micError) && (
            <p className="mt-1 text-xs text-danger">{error ?? micError}</p>
          )}
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 7: 创建 `src/app/(main)/speaking/_components/word-scores.tsx`**

```tsx
"use client";

import type { TurnAssessment } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/**
 * Renders the reference sentence with per-word colour from Azure scores.
 * Matches Azure's word list to the sentence tokens positionally; Azure
 * returns words in spoken order including Omission/Insertion error types.
 */
export function WordScores({
  sentence,
  words,
}: {
  sentence: string;
  words: TurnAssessment["words"];
}) {
  return (
    <p className="font-serif text-[15px] leading-relaxed">
      {words.map((w, i) => (
        <span key={i}>
          <span
            title={[
              `${Math.round(w.accuracyScore)}${w.errorType !== "None" ? ` · ${w.errorType}` : ""}`,
              ...w.phonemes.map((p) => `/${p.phoneme}/ ${Math.round(p.accuracyScore)}`),
            ].join("\n")}
            className={cn(
              "rounded px-0.5 transition-colors",
              w.errorType === "Omission" && "bg-danger/10 text-danger line-through",
              w.errorType === "Insertion" && "bg-warning/10 text-muted-foreground italic",
              w.errorType === "None" &&
                (w.accuracyScore >= 80
                  ? "text-success"
                  : w.accuracyScore >= 60
                    ? "text-warning"
                    : "text-danger"),
              w.errorType === "Mispronunciation" && "text-danger underline decoration-wavy",
            )}
          >
            {w.word}
          </span>{" "}
        </span>
      ))}
    </p>
  );
}
```

注意：写代码前 `grep -n "warning\|success\|danger" src/app/globals.css` 确认这三个语义 token 存在；若 `text-warning` 不存在，改用现有最接近的 token（不要引入原始色值）。`sentence` 参数保留（Azure miscue 模式下 words 已含全部参考词，当前实现不直接用它，但签名保持以便后续 fallback）。

- [ ] **Step 8: 端到端浏览器验证**

1. 打开 `/speaking` → 点一道题进入 script 页
2. Generate script → 内容引用了 settings 里的口语档案
3. Edit → 改一句 → Save → 分句列表随之更新
4. Start practice → 点第一句麦克风 → 朗读 → Stop → 单词着色 + 分数出现；故意读错一个词再录 → 该词标红
5. 读 2-3 句后 Finish → 汇总分卡片出现
6. 回 `/speaking` → 该题显示练习次数 1 + 最高分
7. 检查 `public/media/speaking/<sessionId>/` 有 wav 文件；`speaking_sessions.status = 'completed'`

- [ ] **Step 9: Lint + build**

```bash
npm run lint && npm run build
```

Expected: 无错误（warning 可接受但看一眼）。

- [ ] **Step 10: Commit**

```bash
git add src/lib/actions/speaking.ts src/lib/speaking/ src/app/\(main\)/speaking/
git commit -m "feat(speaking): read-aloud practice page with per-sentence Azure scoring"
```

---

## 完成后

- 更新 `data/tcf-speaking.json` 为真实题库并重跑 `npm run import:speaking`（用户操作）
- Phase 2（模拟对话 + 报告 + errors 接入）另起计划，见 spec 第 8 节
