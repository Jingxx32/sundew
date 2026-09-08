# TCF 单题讲解写入端点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加一个 dev-only 的 HTTP 端点，让另一个仓库的会话用一条 curl 把单题讲解写进 `tcf_questions`，用户刷新页面即可看到。

**Architecture:** 把现有 `parseExplanationFile()` 拆成"frontmatter 可选"的 `parseExplanationBody()` 加一层薄包装，使同一份解析逻辑既服务批量 sync 脚本（要求 frontmatter），也服务新端点（允许用 URL 参数替代）。定位信息的归并单独抽成纯函数以便测试。路由层只做 IO 编排。

**Tech Stack:** Next.js App Router route handler、Drizzle ORM (postgres.js)、`node:test` + `npx tsx --test`

Historical design: `docs/archive/specs/2026-08-18-tcf-explanation-write-endpoint-design.md`

> **2026-08-25 修订（解耦 french-wiki / sundew）：** 本文档描述的"文件是真源、
> 数据库是投影"已被推翻。讲解现在**只存在数据库里**，`POST /api/tcf/explanations`
> 是唯一写入通路；`scripts/sync-tcf-explanations.ts`、`npm run tcf:explain-sync`
> 与环境变量 `TCF_EXPLANATIONS_DIR` 均已删除，lumiere 不再读写 french-wiki 仓库
> 里的任何目录。反向的 `npm run tcf:explain-export` 把库里讲解导成 markdown 存进
> gitignore 的 `data/tcf-explanations/`，那是**备份**，恢复靠重新 POST。
> 下文凡涉及文件真源、双写、sundew 的段落均按此理解。

## Global Constraints

- **git commit 不得带 `Co-Authored-By: Claude` 或 `Generated with Claude Code` 尾注**（CLAUDE.md 明确要求）。用普通 conventional commit。
- 全量验证命令：`npx tsc --noEmit && npm run lint`
- 单元测试运行方式：`npx tsx --test <file>`（项目 package.json 里没有 `test` 脚本，手动跑）
- 端点仅在开发环境存在：`process.env.NODE_ENV === "production"` 时返回 404
- 错误响应统一 `Response.json({ error: "snake_case" }, { status })`，与 `src/app/api/speaking/assess/route.ts` 一致
- 数据库写入范围严格限制在 `tcf_questions.explanation` 与 `tcf_questions.translation_en` 两列
- 不修改 `scripts/sync-tcf-explanations.ts`，不修改任何 TCF 前端组件

---

### Task 1: 解析器拆分（frontmatter 变为可选）

**Files:**
- Modify: `src/lib/tcf/parse-explanation.ts`
- Test: `src/lib/tcf/parse-explanation.test.ts`

**Interfaces:**
- Consumes: 无（本任务是起点）
- Produces:
  - `interface ExplanationLocator { test: number; skill: "reading" | "listening"; question: number }`
  - `interface ParsedExplanationBody { locator: ExplanationLocator | null; body: string; translationEn: string | null }`
  - `parseExplanationBody(raw: string): ParsedExplanationBody`
  - `parseExplanationFile(raw: string): ParsedExplanation` — 签名与行为不变
  - `explanationLocatorLabel(p: ExplanationLocator): string` — 返回 `"CE-T1-Q5"`（无扩展名）
  - `expectedFileName(p: ExplanationLocator): string` — 返回 `"CE-T1-Q5.md"`，行为不变

- [ ] **Step 1: 写失败的测试**

在 `src/lib/tcf/parse-explanation.test.ts` 顶部把 import 改成：

```ts
import {
  parseExplanationFile,
  parseExplanationBody,
  expectedFileName,
  explanationLocatorLabel,
} from "./parse-explanation";
```

然后在文件**末尾**追加：

```ts
test("parseExplanationBody returns a null locator when frontmatter is absent", () => {
  const raw = "## 全文翻译\n\nSome text.\n\n## 题干\n\nfoo\n";
  const p = parseExplanationBody(raw);
  assert.equal(p.locator, null);
  assert.ok(p.body.startsWith("## 全文翻译"));
  assert.equal(p.translationEn, "Some text.");
});

test("parseExplanationBody returns the locator when frontmatter is present", () => {
  const p = parseExplanationBody(SAMPLE);
  assert.deepEqual(p.locator, { test: 1, skill: "reading", question: 5 });
  assert.ok(p.body.startsWith("## 全文翻译"));
});

test("parseExplanationBody still rejects an invalid skill", () => {
  const raw = `---\ntest: 1\nskill: speaking\nquestion: 5\n---\n\n## 题干\nfoo\n`;
  assert.throws(() => parseExplanationBody(raw), /skill/i);
});

test("parseExplanationBody still rejects an incomplete locator", () => {
  const raw = `---\ntest: 1\nskill: reading\n---\n\n## 题干\nfoo\n`;
  assert.throws(() => parseExplanationBody(raw), /question/i);
});

test("explanationLocatorLabel builds the CE/CO label without the extension", () => {
  assert.equal(explanationLocatorLabel({ test: 1, skill: "reading", question: 5 }), "CE-T1-Q5");
  assert.equal(
    explanationLocatorLabel({ test: 13, skill: "listening", question: 30 }),
    "CO-T13-Q30",
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test src/lib/tcf/parse-explanation.test.ts`
Expected: FAIL —— 报 `parseExplanationBody is not a function` / `explanationLocatorLabel is not a function`（TS 层面也会报导出不存在）

- [ ] **Step 3: 实现拆分**

把 `src/lib/tcf/parse-explanation.ts` 里从 `export interface ParsedExplanation` 开始的类型声明替换为：

```ts
/** 唯一确定一道题的三元组。 */
export interface ExplanationLocator {
  test: number;
  skill: "reading" | "listening";
  question: number;
}

export interface ParsedExplanation extends ExplanationLocator {
  /** Everything after the frontmatter, trimmed — written verbatim to `explanation`. */
  body: string;
  /** Body of the "## 全文翻译" section, or null when the file has none. */
  translationEn: string | null;
}

/** 与 ParsedExplanation 的区别：没有 frontmatter 时 locator 为 null 而不是抛错。 */
export interface ParsedExplanationBody {
  locator: ExplanationLocator | null;
  body: string;
  translationEn: string | null;
}
```

把文件末尾的 `parseExplanationFile` 与 `expectedFileName` 替换为：

```ts
/**
 * Parse an explanation whose frontmatter is optional.
 *
 * The HTTP write endpoint accepts bodies with no frontmatter (the locator then
 * comes from the URL), so frontmatter absence is a valid state here rather than
 * an error. `parseExplanationFile` is the stricter wrapper used by the file-based
 * sync script.
 */
export function parseExplanationBody(raw: string): ParsedExplanationBody {
  const trimmed = raw.replace(/^\s+/, "");
  const match = FRONTMATTER.exec(trimmed);

  const body = (match ? trimmed.slice(match[0].length) : trimmed).trim();
  if (body === "") {
    throw new Error("explanation file has an empty body");
  }

  let locator: ExplanationLocator | null = null;
  if (match) {
    const fm: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
      const sep = line.indexOf(":");
      if (sep === -1) continue;
      fm[line.slice(0, sep).trim()] = unquote(line.slice(sep + 1).trim());
    }

    const skill = readField(fm, "skill");
    if (skill !== "reading" && skill !== "listening") {
      throw new Error(
        `explanation frontmatter "skill" must be reading or listening, got "${skill}"`,
      );
    }

    locator = {
      test: readNumber(fm, "test"),
      skill,
      question: readNumber(fm, "question"),
    };
  }

  return { locator, body, translationEn: sectionBody(body, TRANSLATION_HEADING) };
}

export function parseExplanationFile(raw: string): ParsedExplanation {
  const parsed = parseExplanationBody(raw);
  if (parsed.locator === null) {
    throw new Error("explanation file has no --- frontmatter --- block");
  }
  return {
    ...parsed.locator,
    body: parsed.body,
    translationEn: parsed.translationEn,
  };
}

/** Canonical label for a locator — CE = compréhension écrite, CO = orale. */
export function explanationLocatorLabel(p: ExplanationLocator): string {
  const prefix = p.skill === "reading" ? "CE" : "CO";
  return `${prefix}-T${p.test}-Q${p.question}`;
}

export function expectedFileName(p: ExplanationLocator): string {
  return `${explanationLocatorLabel(p)}.md`;
}
```

同时把文件顶部注释块里 `Pure: no IO, no DB.` 那一段保留不动。

**一处有意的行为变化**：`parseExplanationFile("")`（完全空输入）现在抛 `"explanation file has an empty body"`，旧版抛 `"...no --- frontmatter --- block"`。两者都是抛错、都被 sync 脚本按 problem 打印，没有测试依赖旧消息，新消息更准确。这是可接受的。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx tsx --test src/lib/tcf/parse-explanation.test.ts`
Expected: PASS，`pass 17 / fail 0`（原有 12 个 + 新增 5 个）。**原有 12 个必须全部仍然通过**——这是"sync 脚本行为未变"的证据。

- [ ] **Step 5: 类型与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 两者均无输出错误

- [ ] **Step 6: 提交**

```bash
git add src/lib/tcf/parse-explanation.ts src/lib/tcf/parse-explanation.test.ts
git commit -m "refactor(tcf): make explanation frontmatter optional at the parser level"
```

---

### Task 2: 定位信息归并纯函数

**Files:**
- Create: `src/lib/tcf/explanation-locator.ts`
- Test: `src/lib/tcf/explanation-locator.test.ts`

**Interfaces:**
- Consumes: `ExplanationLocator`（Task 1 定义）
- Produces:
  - `type LocatorResolution = { ok: true; locator: ExplanationLocator } | { ok: false; error: "locator_missing" | "locator_conflict" | "invalid_query" }`
  - `resolveExplanationLocator(fromBody: ExplanationLocator | null, params: URLSearchParams): LocatorResolution`

归并规则：frontmatter 优先；缺失时用 URL 参数 `?test=&skill=&q=`；两者都有且不一致时拒绝猜。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/tcf/explanation-locator.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveExplanationLocator } from "./explanation-locator";
import type { ExplanationLocator } from "./parse-explanation";

const BODY: ExplanationLocator = { test: 1, skill: "reading", question: 5 };
const params = (qs: string) => new URLSearchParams(qs);

test("uses the frontmatter locator when the URL names none", () => {
  const r = resolveExplanationLocator(BODY, params(""));
  assert.deepEqual(r, { ok: true, locator: BODY });
});

test("uses the URL locator when the body has no frontmatter", () => {
  const r = resolveExplanationLocator(null, params("test=2&skill=listening&q=30"));
  assert.deepEqual(r, {
    ok: true,
    locator: { test: 2, skill: "listening", question: 30 },
  });
});

test("accepts both when they agree", () => {
  const r = resolveExplanationLocator(BODY, params("test=1&skill=reading&q=5"));
  assert.deepEqual(r, { ok: true, locator: BODY });
});

test("refuses to guess when frontmatter and URL disagree", () => {
  const r = resolveExplanationLocator(BODY, params("test=1&skill=reading&q=6"));
  assert.deepEqual(r, { ok: false, error: "locator_conflict" });
});

test("reports a missing locator when neither side names one", () => {
  const r = resolveExplanationLocator(null, params(""));
  assert.deepEqual(r, { ok: false, error: "locator_missing" });
});

test("rejects a partial URL locator", () => {
  const r = resolveExplanationLocator(null, params("test=2&skill=listening"));
  assert.deepEqual(r, { ok: false, error: "invalid_query" });
});

test("rejects an unknown skill in the URL", () => {
  const r = resolveExplanationLocator(null, params("test=2&skill=speaking&q=3"));
  assert.deepEqual(r, { ok: false, error: "invalid_query" });
});

test("rejects a non-numeric or non-positive number in the URL", () => {
  assert.deepEqual(resolveExplanationLocator(null, params("test=abc&skill=reading&q=5")), {
    ok: false,
    error: "invalid_query",
  });
  assert.deepEqual(resolveExplanationLocator(null, params("test=0&skill=reading&q=5")), {
    ok: false,
    error: "invalid_query",
  });
  assert.deepEqual(resolveExplanationLocator(null, params("test=1&skill=reading&q=1.5")), {
    ok: false,
    error: "invalid_query",
  });
});

test("a malformed URL locator loses even when frontmatter is valid", () => {
  const r = resolveExplanationLocator(BODY, params("test=1&skill=reading"));
  assert.deepEqual(r, { ok: false, error: "invalid_query" });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test src/lib/tcf/explanation-locator.test.ts`
Expected: FAIL —— `Cannot find module './explanation-locator'`

- [ ] **Step 3: 实现**

创建 `src/lib/tcf/explanation-locator.ts`：

```ts
/**
 * Merge the two places a question locator can come from: the explanation's own
 * frontmatter, and the write endpoint's URL query.
 *
 * Frontmatter wins when only it is present; the query fills in when the body
 * carries none. When both are present and disagree, this refuses to guess —
 * the same stance scripts/sync-tcf-explanations.ts takes on an ambiguous match.
 *
 * Pure: no IO, no DB.
 */
import type { ExplanationLocator } from "./parse-explanation";

export type LocatorResolution =
  | { ok: true; locator: ExplanationLocator }
  | { ok: false; error: "locator_missing" | "locator_conflict" | "invalid_query" };

const QUERY_KEYS = ["test", "skill", "q"] as const;

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The locator the URL names, `null` when it names none, and `undefined` when it
 * names one that is incomplete or malformed.
 */
function fromQuery(params: URLSearchParams): ExplanationLocator | null | undefined {
  const present = QUERY_KEYS.filter((k) => params.get(k) !== null);
  if (present.length === 0) return null;
  if (present.length < QUERY_KEYS.length) return undefined;

  const test = positiveInt(params.get("test")!);
  const question = positiveInt(params.get("q")!);
  const skill = params.get("skill")!;

  if (test === null || question === null) return undefined;
  if (skill !== "reading" && skill !== "listening") return undefined;

  return { test, skill, question };
}

export function resolveExplanationLocator(
  fromBody: ExplanationLocator | null,
  params: URLSearchParams,
): LocatorResolution {
  const query = fromQuery(params);
  if (query === undefined) return { ok: false, error: "invalid_query" };

  if (query === null) {
    return fromBody === null
      ? { ok: false, error: "locator_missing" }
      : { ok: true, locator: fromBody };
  }
  if (fromBody === null) return { ok: true, locator: query };

  const agree =
    fromBody.test === query.test &&
    fromBody.skill === query.skill &&
    fromBody.question === query.question;

  return agree ? { ok: true, locator: fromBody } : { ok: false, error: "locator_conflict" };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx tsx --test src/lib/tcf/explanation-locator.test.ts`
Expected: PASS，`pass 9 / fail 0`

- [ ] **Step 5: 类型与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误

- [ ] **Step 6: 提交**

```bash
git add src/lib/tcf/explanation-locator.ts src/lib/tcf/explanation-locator.test.ts
git commit -m "feat(tcf): resolve explanation locators from frontmatter or query"
```

---

### Task 3: 写入端点

**Files:**
- Create: `src/app/api/tcf/explanations/route.ts`

**Interfaces:**
- Consumes: `parseExplanationBody`、`explanationLocatorLabel`（Task 1）；`resolveExplanationLocator`（Task 2）
- Produces: `POST /api/tcf/explanations`

本任务没有自动化测试——项目没有 HTTP 集成测试设施（`package.json` 无 test 脚本，现有测试全是纯函数单测）。逻辑分支已在 Task 1/2 的纯函数里覆盖；路由层只做 IO 编排，用真实 curl 验证。

- [ ] **Step 1: 实现路由**

创建 `src/app/api/tcf/explanations/route.ts`：

```ts
/**
 * Write one hand-written TCF explanation into the database.
 *
 *   POST /api/tcf/explanations
 *   POST /api/tcf/explanations?test=1&skill=listening&q=3
 *
 * The body is raw markdown, not JSON: explanations contain tables, quotes and
 * backticks, and JSON escaping them by hand is error-prone. The locator comes
 * from the markdown's own frontmatter when it has one, otherwise from the query.
 *
 * Dev-only and unauthenticated — see the design doc's security section. It can
 * only overwrite two columns of an already-existing question; it cannot insert
 * rows or touch any other table.
 *
 * Files under TCF_EXPLANATIONS_DIR remain the source of truth; this endpoint is
 * the day-to-day single-question path, and scripts/sync-tcf-explanations.ts
 * stays the bulk restore path after a test re-import wipes the column.
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tcfQuestions, tcfSets } from "@/lib/db/schema";
import { parseExplanationBody, explanationLocatorLabel } from "@/lib/tcf/parse-explanation";
import { resolveExplanationLocator } from "@/lib/tcf/explanation-locator";

/** Hand-written prose with tables; the longest realistic explanation is a few KB. */
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const raw = await request.text();
  if (raw.trim() === "") {
    return Response.json({ error: "empty_body" }, { status: 400 });
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "body_too_large" }, { status: 413 });
  }

  let parsed;
  try {
    parsed = parseExplanationBody(raw);
  } catch (err) {
    return Response.json(
      { error: "invalid_format", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const resolved = resolveExplanationLocator(
    parsed.locator,
    new URL(request.url).searchParams,
  );
  if (!resolved.ok) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }
  const locator = resolved.locator;
  const label = explanationLocatorLabel(locator);

  const rows = await db
    .select({ id: tcfQuestions.id })
    .from(tcfQuestions)
    .innerJoin(tcfSets, eq(tcfQuestions.setId, tcfSets.id))
    .where(
      and(
        eq(tcfSets.testNumber, locator.test),
        eq(tcfSets.skill, locator.skill),
        eq(tcfQuestions.orderIndex, locator.question),
      ),
    );

  if (rows.length === 0) {
    return Response.json({ error: "question_not_found", locator: label }, { status: 404 });
  }
  // (set_id, order_index) carries no unique constraint, so this is reachable.
  if (rows.length > 1) {
    return Response.json(
      { error: "ambiguous_locator", locator: label, matched: rows.length },
      { status: 409 },
    );
  }

  await db
    .update(tcfQuestions)
    .set({ explanation: parsed.body, translationEn: parsed.translationEn })
    .where(eq(tcfQuestions.id, rows[0].id));

  return Response.json({
    ok: true,
    locator: label,
    questionId: rows[0].id,
    hasTranslation: parsed.translationEn !== null,
  });
}
```

- [ ] **Step 2: 类型与 lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 均无错误

- [ ] **Step 3: 启动 dev server**

Run: `npm run dev`
Expected: `Ready on http://localhost:3000`（若用户已自行开着 dev server，跳过此步）

- [ ] **Step 4: 验证成功路径（frontmatter 定位）**

```bash
curl -s -X POST localhost:3000/api/tcf/explanations --data-binary @- <<'EOF'
---
test: 1
skill: listening
question: 1
---

## 全文翻译

Endpoint smoke test — this row is reset in a later step.

## 题干

Contenu de vérification.
EOF
```

Expected: `{"ok":true,"locator":"CO-T1-Q1","questionId":"…","hasTranslation":true}`

- [ ] **Step 5: 验证成功路径（URL 参数定位，正文无 frontmatter）**

```bash
curl -s -X POST "localhost:3000/api/tcf/explanations?test=1&skill=listening&q=2" \
  --data-binary $'## 题干\n\nContenu de vérification sans frontmatter.\n'
```

Expected: `{"ok":true,"locator":"CO-T1-Q2","questionId":"…","hasTranslation":false}`

- [ ] **Step 6: 验证错误路径**

```bash
# 无 frontmatter 且无 URL 参数 → 400 locator_missing
curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3000/api/tcf/explanations \
  --data-binary $'## 题干\nfoo\n'
# frontmatter 与 URL 冲突 → 400 locator_conflict
curl -s -o /dev/null -w "%{http_code} " -X POST \
  "localhost:3000/api/tcf/explanations?test=1&skill=listening&q=9" \
  --data-binary $'---\ntest: 1\nskill: listening\nquestion: 1\n---\n\n## 题干\nfoo\n'
# 查无此题（order_index 上限是 39）→ 404 question_not_found
curl -s -o /dev/null -w "%{http_code} " -X POST \
  "localhost:3000/api/tcf/explanations?test=1&skill=listening&q=99" \
  --data-binary $'## 题干\nfoo\n'
# frontmatter 里 skill 非法 → 400 invalid_format
curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3000/api/tcf/explanations \
  --data-binary $'---\ntest: 1\nskill: speaking\nquestion: 1\n---\n\n## 题干\nfoo\n'
# 空请求体 → 400 empty_body
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/tcf/explanations --data-binary ''
```

Expected: `400 400 404 400 400`

顺带确认 `invalid_format` 会带上解析器原话：

```bash
curl -s -X POST localhost:3000/api/tcf/explanations \
  --data-binary $'---\ntest: 1\nskill: speaking\nquestion: 1\n---\n\n## 题干\nfoo\n'
```

Expected: `{"error":"invalid_format","detail":"explanation frontmatter \"skill\" must be reading or listening, got \"speaking\""}`

- [ ] **Step 7: 在页面上确认渲染**

用 Step 4 响应里的 `questionId` 走深链，避免猜该题属于哪个 level 分组
（`src/app/tcf/drill/page.tsx` 会用 `?q=` 反推 skill 与 level）：

```
http://localhost:3000/tcf/drill?q=<Step 4 返回的 questionId>
```

在该题上点任一选项作答以揭晓答案。

Expected: 选项下方出现「Explication」面板，内容是 Step 4 写入的文字，且 `## 全文翻译` / `## 题干` 渲染成标题而不是字面的 `##`。

- [ ] **Step 8: 清理验证数据**

```bash
cd /Users/xujingxuan/Documents/Projects/lumiere
cat > .tmp-reset.ts <<'EOF'
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const r = await sql`
    update tcf_questions q set explanation = null, translation_en = null
    from tcf_sets s
    where q.set_id = s.id and s.test_number = 1 and s.skill = 'listening'
      and q.order_index in (1, 2)
    returning q.order_index`;
  console.log("reset rows:", r.length);
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
EOF
npx tsx .tmp-reset.ts
rm -f .tmp-reset.ts
```

Expected: `reset rows: 2`

- [ ] **Step 9: 提交**

```bash
git add src/app/api/tcf/explanations/route.ts
git commit -m "feat(tcf): add a dev-only endpoint for writing one explanation"
```

---

### Task 4: 记录调用方约定

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 3 的端点契约
- Produces: 无代码产物

端点的价值取决于生成端能否产出合规输入。把约定写进 CLAUDE.md，这样未来任何会话（包括 french wiki 那边被问到时）都能查到。

- [ ] **Step 1: 编辑 CLAUDE.md**

在 `## Commands` 一节中 `npm run db:reenrich` 那一行下方的代码块之后、`TCF import/TTS pipeline scripts...` 段落之前，插入：

````markdown
### 写入单题 TCF 讲解

日常逐题写讲解走 dev-only 端点（需 `npm run dev` 开着）：

```bash
curl -X POST localhost:3000/api/tcf/explanations --data-binary @CE-T1-Q5.md
curl -X POST "localhost:3000/api/tcf/explanations?test=1&skill=listening&q=3" --data-binary @-
```

正文是原始 markdown。定位取自 frontmatter（`test` / `skill` / `question`），
缺失时取 URL 的 `?test=&skill=&q=`；两者不一致会被拒绝。生成讲解时必须满足：

- `skill` 只能是字面的 `reading` / `listening`
- `question` 是该套试卷内的序号（1–39），不是全局题号
- 英文翻译放在标题恰好为 `## 全文翻译` 的段落下，否则 `translation_en` 为 null
- 不要输出对话式口头禅（如「说 next。」），会原样渲染到页面上
- 不要把整篇内容包在代码围栏里，首行必须是 `---` 或正文本身
````

（插入时请用四个反引号作为最外层围栏，内层 `bash` 块保持三个。）

- [ ] **Step 2: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: record the TCF explanation write endpoint contract"
```

---

## 完成后

Commit `docs/archive/specs/2026-08-18-tcf-explanation-write-endpoint-design.md` with this historical plan if it has not already been committed.

不做的事（已在设计中排除）：不改 TCF 前端组件、不动 `scripts/sync-tcf-explanations.ts`、不加鉴权、不加 `revalidatePath`（drill 页 `await searchParams` 已是动态渲染，硬刷新即重查）。
