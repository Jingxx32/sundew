# TCF 题目精讲入库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TCF 刷题页在揭晓答案后显示一篇 Markdown 讲解，内容来源是仓库里逐题手写的 markdown 文件，由脚本同步进 `tcf_questions.explanation`。

**Architecture:** 文件是真源，数据库是派生物。`data/tcf-explanations/CE-T1-Q5.md` → 纯函数解析器抽出 frontmatter 定位键与正文 → 同步脚本按 `test + skill + order_index` upsert 进已有的 `explanation` / `translation_en` 两列 → 两个 runner 组件用 react-markdown 渲染。不新增表、不新增列、不改数据模型。

**Tech Stack:** TypeScript, Next.js 16 (App Router, React 19), drizzle-orm + postgres-js, tsx, `node:test`（内置，无需新增测试框架），react-markdown + remark-gfm。

Historical design: `docs/archive/specs/2026-08-13-tcf-explanations-design.md`

> **2026-08-25 修订（解耦 french-wiki / sundew）：** 本文档描述的"文件是真源、
> 数据库是投影"已被推翻。讲解现在**只存在数据库里**，`POST /api/tcf/explanations`
> 是唯一写入通路；`scripts/sync-tcf-explanations.ts`、`npm run tcf:explain-sync`
> 与环境变量 `TCF_EXPLANATIONS_DIR` 均已删除，lumiere 不再读写 french-wiki 仓库
> 里的任何目录。反向的 `npm run tcf:explain-export` 把库里讲解导成 markdown 存进
> gitignore 的 `data/tcf-explanations/`，那是**备份**，恢复靠重新 POST。
> 下文凡涉及文件真源、双写、sundew 的段落均按此理解。

## Global Constraints

- 不新增数据库表、列或 migration。只写已存在的 `tcf_questions.explanation` 与 `tcf_questions.translation_en`。
- 题目定位键固定为 `tcf_sets.test_number` + `tcf_sets.skill` + `tcf_questions.order_index`，绝不用题干文字匹配（题干跨套重复）。
- 测试用 `npx tsx --test <file>`，不引入 vitest/jest。已验证该组合在本仓库可用。
- 脚本连库沿用 `scripts/import-tcf-reading.ts` 的写法：文件顶部先 `config({ path: ".env.local" })` 再 `config({ path: ".env" })`，然后自建 `postgres()` + `drizzle()`，**不要** import `src/lib/db/index.ts`（那份带 HMR 全局缓存，是给 Next 运行时用的）。
- 前端组件样式沿用 drill-runner 里 Transcription 区块的既有类名，不自创设计语言。
- 提交信息用英文，遵循仓库现有的 `type(scope): summary` 格式，**不带任何 Co-Authored-By trailer**。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/lib/tcf/parse-explanation.ts`（新建） | 纯函数：把一个讲解 md 文件的文本解析成 `{ test, skill, question, body, translationEn }`。无 IO、无 DB |
| `src/lib/tcf/parse-explanation.test.ts`（新建） | 上者的单元测试 |
| `scripts/sync-tcf-explanations.ts`（新建） | 扫目录 → 解析 → 按定位键写库。唯一碰 DB 的文件 |
| `data/tcf-explanations/*.md`（新建目录） | 讲解正文，真源 |
| `src/lib/actions/tcf.ts`（修改） | 在两个查询里 select 出 `explanation` |
| `src/app/tcf/_components/explanation-panel.tsx`（新建） | 唯一的 Markdown 渲染组件，两个 runner 共用 |
| `src/app/tcf/_components/drill-runner.tsx`（修改） | 揭晓答案后挂上 panel |
| `src/app/tcf/_components/exam-runner.tsx`（修改） | 交卷后挂上 panel |
| `package.json`（修改） | 加 `tcf:explain-sync` 脚本 + 两个渲染依赖 |

---

## Task 1: 讲解文件解析器

**Files:**
- Create: `src/lib/tcf/parse-explanation.ts`
- Test: `src/lib/tcf/parse-explanation.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  ```ts
  export interface ParsedExplanation {
    test: number;
    skill: "reading" | "listening";
    question: number;
    /** frontmatter 之后的全文，trim 过，原样入 explanation 列 */
    body: string;
    /** "## 全文翻译" 区块的正文，缺失时 null */
    translationEn: string | null;
  }
  export function parseExplanationFile(raw: string): ParsedExplanation;
  export function expectedFileName(p: Pick<ParsedExplanation, "test" | "skill" | "question">): string;
  ```

- [ ] **Step 1: Write the failing test**

创建 `src/lib/tcf/parse-explanation.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseExplanationFile, expectedFileName } from "./parse-explanation";

const SAMPLE = `---
test: 1
skill: reading
question: 5
written: 2026-08-13
---

## 全文翻译

**Question** — What is Julien's favorite hobby?

**Options** — A. Reading · B. Cycling · C. Painting · D. Cooking

## 题干

Quel est le passe-temps préféré de Julien ?

**答案：B**
`;

test("parses the frontmatter locator", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.equal(p.test, 1);
  assert.equal(p.skill, "reading");
  assert.equal(p.question, 5);
});

test("body starts after the frontmatter and keeps the whole explanation", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.ok(p.body.startsWith("## 全文翻译"));
  assert.ok(p.body.includes("**答案：B**"));
  assert.ok(!p.body.includes("written:"));
});

test("extracts the 全文翻译 section, stopping at the next heading", () => {
  const p = parseExplanationFile(SAMPLE);
  assert.ok(p.translationEn !== null);
  assert.ok(p.translationEn.startsWith("**Question**"));
  assert.ok(p.translationEn.includes("D. Cooking"));
  assert.ok(!p.translationEn.includes("题干"));
});

test("translationEn is null when the section is absent", () => {
  const raw = `---
test: 2
skill: listening
question: 30
written: 2026-08-13
---

## 题干

Rien à traduire.
`;
  assert.equal(parseExplanationFile(raw).translationEn, null);
});

test("throws when frontmatter is missing", () => {
  assert.throws(() => parseExplanationFile("## 题干\nfoo\n"), /frontmatter/i);
});

test("throws on an unknown skill", () => {
  const raw = `---
test: 1
skill: speaking
question: 5
written: 2026-08-13
---

## 题干
foo
`;
  assert.throws(() => parseExplanationFile(raw), /skill/i);
});

test("throws when a locator field is missing", () => {
  const raw = `---
test: 1
skill: reading
written: 2026-08-13
---

## 题干
foo
`;
  assert.throws(() => parseExplanationFile(raw), /question/i);
});

test("expectedFileName builds the CE/CO convention", () => {
  assert.equal(expectedFileName({ test: 1, skill: "reading", question: 5 }), "CE-T1-Q5.md");
  assert.equal(expectedFileName({ test: 13, skill: "listening", question: 30 }), "CO-T13-Q30.md");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/Documents/Projects/lumiere && npx tsx --test src/lib/tcf/parse-explanation.test.ts
```

Expected: FAIL — `Cannot find module './parse-explanation'`。

- [ ] **Step 3: Write minimal implementation**

创建 `src/lib/tcf/parse-explanation.ts`：

```ts
/**
 * Parse one TCF explanation markdown file.
 *
 * Layout (see docs/archive/specs/2026-08-13-tcf-explanations-design.md §4):
 *
 *   ---
 *   test: 1
 *   skill: reading
 *   question: 5
 *   written: 2026-08-13
 *   ---
 *
 *   ## 全文翻译
 *   …
 *   ## 题干
 *   …
 *
 * Pure: no IO, no DB. `written` is informational and deliberately not returned.
 */

export interface ParsedExplanation {
  test: number;
  skill: "reading" | "listening";
  question: number;
  /** Everything after the frontmatter, trimmed — written verbatim to `explanation`. */
  body: string;
  /** Body of the "## 全文翻译" section, or null when the file has none. */
  translationEn: string | null;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const TRANSLATION_HEADING = "全文翻译";

function readField(fm: Record<string, string>, key: string): string {
  const value = fm[key];
  if (value === undefined || value === "") {
    throw new Error(`explanation frontmatter is missing "${key}"`);
  }
  return value;
}

function readNumber(fm: Record<string, string>, key: string): number {
  const raw = readField(fm, key);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`explanation frontmatter "${key}" must be a positive integer, got "${raw}"`);
  }
  return n;
}

/** Content of the first `## <heading>` section, up to the next heading of any level. */
function sectionBody(body: string, heading: string): string | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.includes(heading));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  const picked = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return picked === "" ? null : picked;
}

export function parseExplanationFile(raw: string): ParsedExplanation {
  const match = FRONTMATTER.exec(raw);
  if (!match) {
    throw new Error("explanation file has no --- frontmatter --- block");
  }

  const fm: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    fm[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }

  const skill = readField(fm, "skill");
  if (skill !== "reading" && skill !== "listening") {
    throw new Error(`explanation frontmatter "skill" must be reading or listening, got "${skill}"`);
  }

  const body = raw.slice(match[0].length).trim();
  if (body === "") {
    throw new Error("explanation file has an empty body");
  }

  return {
    test: readNumber(fm, "test"),
    skill,
    question: readNumber(fm, "question"),
    body,
    translationEn: sectionBody(body, TRANSLATION_HEADING),
  };
}

/** Canonical file name for a locator — CE = compréhension écrite, CO = orale. */
export function expectedFileName(
  p: Pick<ParsedExplanation, "test" | "skill" | "question">,
): string {
  const prefix = p.skill === "reading" ? "CE" : "CO";
  return `${prefix}-T${p.test}-Q${p.question}.md`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/Documents/Projects/lumiere && npx tsx --test src/lib/tcf/parse-explanation.test.ts
```

Expected: PASS — `pass 8`, `fail 0`。

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/lumiere && git add src/lib/tcf/parse-explanation.ts src/lib/tcf/parse-explanation.test.ts && git commit -m "feat(tcf): parse per-question explanation markdown files"
```

---

## Task 2: 同步脚本

**Files:**
- Create: `scripts/sync-tcf-explanations.ts`
- Create: `data/tcf-explanations/.gitkeep`
- Modify: `package.json`（`scripts` 段加一行）

**Interfaces:**
- Consumes: `parseExplanationFile`, `expectedFileName`（Task 1）；`tcfSets`, `tcfQuestions`（`src/lib/db/schema`）
- Produces: `npm run tcf:explain-sync` 命令。退出码 0 = 全部成功，1 = 有文件未能匹配或解析失败

- [ ] **Step 1: 建目录并占位**

```bash
cd ~/Documents/Projects/lumiere && mkdir -p data/tcf-explanations && touch data/tcf-explanations/.gitkeep
```

- [ ] **Step 2: 写脚本**

创建 `scripts/sync-tcf-explanations.ts`：

```ts
/**
 * Sync hand-written TCF explanations into the DB.
 *
 *   npm run tcf:explain-sync
 *
 * Files under data/tcf-explanations/*.md are the source of truth; this script
 * only projects them onto tcf_questions.explanation / .translation_en. Re-running
 * a test import (which deletes + re-inserts its questions) wipes those columns —
 * re-run this script afterwards to restore every explanation.
 *
 * Idempotent: each file targets exactly one row, matched on
 * tcf_sets.test_number + tcf_sets.skill + tcf_questions.order_index.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readdirSync, readFileSync } from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";

import { tcfSets, tcfQuestions } from "../src/lib/db/schema";
import { parseExplanationFile, expectedFileName } from "../src/lib/tcf/parse-explanation";

const DIR = path.join(process.cwd(), "data", "tcf-explanations");

async function main() {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.log("No explanation files in data/tcf-explanations — nothing to do.");
    return;
  }

  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  let updated = 0;
  const problems: string[] = [];

  for (const file of files) {
    try {
      const parsed = parseExplanationFile(readFileSync(path.join(DIR, file), "utf8"));

      const expected = expectedFileName(parsed);
      if (file !== expected) {
        problems.push(`${file}: frontmatter says this should be named ${expected}`);
        continue;
      }

      const rows = await db
        .select({ id: tcfQuestions.id })
        .from(tcfQuestions)
        .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
        .where(
          and(
            eq(tcfSets.testNumber, parsed.test),
            eq(tcfSets.skill, parsed.skill),
            eq(tcfQuestions.orderIndex, parsed.question),
          ),
        );

      if (rows.length === 0) {
        problems.push(
          `${file}: no question for test ${parsed.test} / ${parsed.skill} / Q${parsed.question}`,
        );
        continue;
      }
      if (rows.length > 1) {
        problems.push(`${file}: locator matched ${rows.length} rows — refusing to guess`);
        continue;
      }

      await db
        .update(tcfQuestions)
        .set({
          explanation: parsed.body,
          ...(parsed.translationEn ? { translationEn: parsed.translationEn } : {}),
        })
        .where(eq(tcfQuestions.id, rows[0].id));

      updated += 1;
      console.log(`✓ ${file}`);
    } catch (err) {
      problems.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await client.end();

  console.log(`\n${updated}/${files.length} explanation(s) synced.`);
  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exitCode = 1;
  }
}

main();
```

- [ ] **Step 3: 注册 npm 脚本**

在 `package.json` 的 `scripts` 里，`db:reenrich` 那一行之后加：

```json
    "tcf:explain-sync": "tsx scripts/sync-tcf-explanations.ts"
```

- [ ] **Step 4: 空目录跑一次，确认不炸**

```bash
cd ~/Documents/Projects/lumiere && npm run tcf:explain-sync
```

Expected: 打印 `No explanation files in data/tcf-explanations — nothing to do.`，退出码 0。

- [ ] **Step 5: 用真实讲解跑一次**

创建 `data/tcf-explanations/CE-T1-Q5.md`，frontmatter 为 `test: 1 / skill: reading / question: 5 / written: 2026-08-13`，正文用本次会话已产出的 T1 Q5 讲解全文（含 `## 全文翻译` 区块）。然后：

```bash
cd ~/Documents/Projects/lumiere && npm run tcf:explain-sync
```

Expected: `✓ CE-T1-Q5.md`，然后 `1/1 explanation(s) synced.`，退出码 0。

- [ ] **Step 6: 验证写进去了**

```bash
cd ~/Documents/Projects/lumiere && cat > peek.tmp.mts <<'EOF'
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const r = await sql`select q.order_index, length(q.explanation) as expl_len, length(q.translation_en) as tr_len
  from tcf_questions q join tcf_sets s on s.id=q.set_id
  where s.test_number=1 and s.skill='reading' and q.order_index=5`;
console.log(JSON.stringify(r));
await sql.end();
EOF
npx tsx peek.tmp.mts; rm -f peek.tmp.mts
```

Expected: `expl_len` 与 `tr_len` 都是正数（非 null）。

- [ ] **Step 7: 再跑一次确认幂等**

```bash
cd ~/Documents/Projects/lumiere && npm run tcf:explain-sync && npm run tcf:explain-sync
```

Expected: 两次都是 `1/1 explanation(s) synced.`，无报错。

- [ ] **Step 8: Commit**

```bash
cd ~/Documents/Projects/lumiere && git add scripts/sync-tcf-explanations.ts package.json data/tcf-explanations && git commit -m "feat(tcf): sync explanation markdown files into tcf_questions"
```

---

## Task 3: 查询里带出 explanation

**Files:**
- Modify: `src/lib/actions/tcf.ts:90-104`（`TcfQuestionForDrill` 接口）
- Modify: `src/lib/actions/tcf.ts:112-126`（`getTcfSetQuestions` 的 select）
- Modify: `src/lib/actions/tcf.ts:250-264`（`getTcfDrillQuestions` 的 select）

**Interfaces:**
- Consumes: 无
- Produces: `TcfQuestionForDrill` 多一个字段 `explanation: string | null`，两个查询函数都会填它

- [ ] **Step 1: 扩接口**

`src/lib/actions/tcf.ts`，在 `TcfQuestionForDrill` 里 `passage` 那行之后加一行：

```ts
  passage: string | null;
  explanation: string | null;
  imagePath: string | null;
```

- [ ] **Step 2: 两个 select 各加一行**

`getTcfSetQuestions`（约 123 行）与 `getTcfDrillQuestions`（约 261 行），都在 `passage: tcfQuestions.passage,` 之后加：

```ts
      explanation: tcfQuestions.explanation,
```

两处都要改。两个函数末尾的 `rows.map((r) => ({ ...r, ... }))` 已经展开全部字段，不用动。

- [ ] **Step 3: 类型检查**

```bash
cd ~/Documents/Projects/lumiere && npx tsc --noEmit
```

Expected: 无与 `tcf` 相关的报错。（仓库若本来就有其它无关报错，只要没新增即可。）

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Projects/lumiere && git add src/lib/actions/tcf.ts && git commit -m "feat(tcf): expose explanation on drill question queries"
```

---

## Task 4: Markdown 渲染组件

**Files:**
- Modify: `package.json`（两个依赖）
- Create: `src/app/tcf/_components/explanation-panel.tsx`

**Interfaces:**
- Consumes: 无
- Produces:
  ```tsx
  export function ExplanationPanel({ markdown }: { markdown: string }): React.ReactElement | null;
  ```

- [ ] **Step 1: 装依赖**

```bash
cd ~/Documents/Projects/lumiere && npm install react-markdown remark-gfm
```

Expected: 两个包进 `dependencies`，无 peer 冲突报错。

- [ ] **Step 2: 写组件**

创建 `src/app/tcf/_components/explanation-panel.tsx`：

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders one question's hand-written explanation (see
 * docs/archive/specs/2026-08-13-tcf-explanations-design.md).
 *
 * The markdown is authored by hand and contains conjugation tables, so GFM is
 * required — without remark-gfm a table renders as a row of pipes. Styling is
 * an explicit component map rather than a typography plugin, to stay consistent
 * with the surrounding Transcription panel and avoid a new Tailwind dependency.
 */
export function ExplanationPanel({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-surface-muted/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-subtle-foreground font-medium mb-2">
        Explication
      </p>
      <div className="text-sm leading-relaxed text-foreground space-y-3">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h3 className="text-sm font-semibold text-foreground mt-4 first:mt-0">{children}</h3>
            ),
            h2: ({ children }) => (
              <h3 className="text-sm font-semibold text-foreground mt-4 first:mt-0">{children}</h3>
            ),
            h3: ({ children }) => (
              <h4 className="text-sm font-medium text-foreground mt-3">{children}</h4>
            ),
            p: ({ children }) => <p className="my-2">{children}</p>,
            ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
            blockquote: ({ children }) => (
              <blockquote className="my-2 border-l-2 border-border/70 pl-3 text-muted-foreground">
                {children}
              </blockquote>
            ),
            code: ({ children }) => (
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[13px]">
                {children}
              </code>
            ),
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-border/60 bg-surface-muted px-2 py-1 text-left font-medium">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-border/60 px-2 py-1 align-top">{children}</td>
            ),
            hr: () => <hr className="my-4 border-border/60" />,
            a: ({ children }) => <span>{children}</span>,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

```bash
cd ~/Documents/Projects/lumiere && npx tsc --noEmit
```

Expected: 无新增报错。

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Projects/lumiere && git add package.json package-lock.json src/app/tcf/_components/explanation-panel.tsx && git commit -m "feat(tcf): markdown panel for question explanations"
```

---

## Task 5: 接进两个 runner

**Files:**
- Modify: `src/app/tcf/_components/drill-runner.tsx`（import 段 + 约 306 行 Transcript 区块之后）
- Modify: `src/app/tcf/_components/exam-runner.tsx`（import 段 + 约 353 行 Transcript 区块之后）

**Interfaces:**
- Consumes: `ExplanationPanel`（Task 4）；`TcfQuestionForDrill.explanation`（Task 3）
- Produces: 无

- [ ] **Step 1: drill-runner 加 import**

`src/app/tcf/_components/drill-runner.tsx` 顶部与其它本地组件 import 放一起：

```tsx
import { ExplanationPanel } from "./explanation-panel";
```

- [ ] **Step 2: drill-runner 挂上 panel**

找到 Transcript 区块（`{showAnswer && q.transcript && (` … `)}`，结束于约 306 行），**在它之后、包裹 div 的 `</div>` 之前**插入：

```tsx
          {/* Explanation (reveal on answer) */}
          {showAnswer && q.explanation && <ExplanationPanel markdown={q.explanation} />}
```

- [ ] **Step 3: exam-runner 加 import**

`src/app/tcf/_components/exam-runner.tsx`：

```tsx
import { ExplanationPanel } from "./explanation-panel";
```

- [ ] **Step 4: exam-runner 挂上 panel**

找到 Transcript 区块（`{finished && q.transcript && (`，约 346 行起），在它之后插入：

```tsx
          {/* Explanation (review mode) */}
          {finished && q.explanation && <ExplanationPanel markdown={q.explanation} />}
```

- [ ] **Step 5: 类型检查 + 构建**

```bash
cd ~/Documents/Projects/lumiere && npx tsc --noEmit && npm run lint
```

Expected: 均无新增报错。

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/lumiere && git add src/app/tcf/_components/drill-runner.tsx src/app/tcf/_components/exam-runner.tsx && git commit -m "feat(tcf): show explanation after revealing the answer"
```

---

## Task 6: 端到端验证

**Files:**
- 无新增；只跑与看

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 无

- [ ] **Step 1: 起服务**

```bash
cd ~/Documents/Projects/lumiere && npm run dev
```

- [ ] **Step 2: 打开 T1 Q5 并揭晓答案**

浏览器进 TCF 阅读 A2 drill，翻到 Test 1 第 5 题，点「Afficher réponse」。

Expected:
- 选项区下方出现 **Explication** 面板；
- 面板第一块是 `全文翻译`，含英文题干、英文原文、四个英文选项；
- 变位表渲染成真正的表格（有边框、分列），不是一行竖线；
- ⚠️ 与 ✅/❌ 正常显示。

- [ ] **Step 3: 检查未写讲解的题不受影响**

翻到同一 drill 里任意一道没有讲解的题，点「Afficher réponse」。

Expected: 不出现 Explication 面板，也不出现空框。

- [ ] **Step 4: 确认重导可恢复的路径成立**

Do not actually reimport the question bank. Only verify that the restoration command exists and is idempotent (already checked in Task 2 Step 7). Confirm that the restoration note follows §5 of `docs/archive/specs/2026-08-13-tcf-explanations-design.md`; add it if it is missing.

- [ ] **Step 5: Commit（如有改动）**

```bash
cd ~/Documents/Projects/lumiere && git add -A docs data && git commit -m "docs(tcf): note the re-import recovery step for explanations"
```

---

## Self-Review

**Spec coverage**

| Spec 章节 | 落在哪 |
|---|---|
| §2 存储形状 = Markdown 进 `explanation` | Task 2 Step 2（`set({ explanation: parsed.body })`） |
| §2 真源是文件 / 重导可恢复 | Task 2 脚本注释 + Task 6 Step 4 |
| §2 定位键 test + skill + order_index | Task 1 frontmatter + Task 2 查询 where 子句 |
| §2 `translation_en` 顺手填 | Task 1 `translationEn` + Task 2 条件 set |
| §3 不新增表/列 | Global Constraints；全程只 update 两列 |
| §4.1 文件命名 CE/CO | Task 1 `expectedFileName` + Task 2 命名校验 |
| §4.2 frontmatter 不入库 | Task 1 `body` 从 frontmatter 之后切；测试断言不含 `written:` |
| §5 幂等、匹配不到要报错不静默 | Task 2 Step 7（幂等）+ `problems` 数组与退出码 1 |
| §6 react-markdown + remark-gfm | Task 4 Step 1 |
| §6 空讲解不显示空容器 | Task 4 组件内 `if (!markdown.trim()) return null` + Task 5 的 `&&` 守卫；Task 6 Step 3 验证 |
| §7 会话流程（人的行为，非代码） | 不需要任务；已写入长期记忆与 spec |
| §8 明确不做 | 无任务，正确 |

§4.3 正文规范是写作约定，由人执行，无对应代码任务 —— 这是有意的，不是遗漏。

**Placeholder scan:** 无 TBD / TODO / 「similar to Task N」；每个改代码的步骤都给了完整代码或完整插入片段。

**Type consistency:** `ParsedExplanation` 的字段名（`test` / `skill` / `question` / `body` / `translationEn`）在 Task 1 定义、Task 2 使用，一致；`explanation: string | null` 在 Task 3 定义、Task 5 使用，一致；`ExplanationPanel({ markdown })` 在 Task 4 定义、Task 5 按同名 prop 调用，一致。
