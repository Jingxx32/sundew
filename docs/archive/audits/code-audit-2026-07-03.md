# Lumière 代码审计报告

日期：2026-07-03
范围：`src/` 全量（约 11.5k 行）+ 未提交的词汇 enrich 改动
方法：逐文件人工审读（schema、全部 server actions、AI 层、主要客户端组件、页面）

优先级说明：
- **P0** — 真 bug，行为与预期不符，建议尽快修
- **P1** — 可靠性/数据完整性风险，特定条件下丢数据或脏数据
- **P2** — 性能问题，当前数据量下能跑但会随数据增长恶化
- **P3** — 死代码/schema 债务/DRY，不影响行为
- **P4** — 产品/UX 改进建议

每项标注推荐修法（按我认为的最优方式）。

---

## P0 — Bug

### 1. 文档排序：Postgres `DESC` 默认 `NULLS FIRST`，未读文档排在最前

**位置**：[documents.ts:125](src/lib/actions/documents.ts:125)、[documents.ts:141](src/lib/actions/documents.ts:141)

`orderBy(desc(documents.lastReadAt), ...)` 生成 `ORDER BY last_read_at DESC`，Postgres 对 DESC 默认 NULLS FIRST——**从未读过的文档（lastReadAt 为 null）会排在最近读过的文档之前**。`getMostRecentDocument()`（library 页 "继续阅读" 入口）会返回一篇从没打开过的文档而不是上次读的那篇；`listDocuments` 的列表排序同样错乱。

**修复**：两处改为
```ts
orderBy(sql`${documents.lastReadAt} desc nulls last`, desc(documents.createdAt))
```

### 2. 词汇表 "Appears in" 的 TCF 链接跳到错误的题目

**位置**：[vocab-browser.tsx:21](src/app/(main)/vocabulary/_components/vocab-browser.tsx:21) → [drill/page.tsx](src/app/tcf/drill/page.tsx)

`occurrenceHref` 生成 `/tcf/drill?q=<questionId>`，不带 `skill`/`level`。drill 页默认 `skill=listening, level=A2`，然后在该组题里 `findIndex(id)` 找不到（比如这个词来自 B1 阅读题）返回 -1，`Math.max(0,-1)=0` → **静默打开听力 A2 第 1 题**，与点击的出处毫无关系。

**修复**（最优）：drill 页在收到 `q` 参数时先按 id 查这道题，从题目本身推导 skill+level 再取题组：
```ts
if (q) {
  const target = await getTcfQuestionById(q); // 新增一个小查询
  if (target) { skill = target.skill; level = target.level; }
}
```
同时 `findIndex` 为 -1 时应显示提示而不是静默跳 Q1。

### 3. 同面板：出处显示 UUID 而不是文档标题

**位置**：[vocab-browser.tsx:402](src/app/(main)/vocabulary/_components/vocab-browser.tsx:402)

`Document ${o.documentId?.slice(0, 8)}` 直接显示 UUID 前 8 位。**修复**：`getVocabEntryDetail` 里把 occurrences left join `documents.title`（以及 TCF 的 testNumber/orderIndex），返回可读标签，如 "Le Petit Prince" / "TCF 阅读 test 12 · Q7"。

### 4. 反馈生成失败后没有承诺中的 "重试入口"，反馈永久丢失

**位置**：[tasks.ts:181-186](src/lib/actions/tasks.ts:181)、[feedback/page.tsx](src/app/(main)/practice/[submissionId]/feedback/page.tsx)

`createSubmission` 的 catch 注释说 "feedbackJson remains null — the page shows a retry affordance"，但反馈页**没有任何重试 UI，也没有可重试的 server action**。AI 一旦失败（超时/限流），这次写作的反馈就永远拿不回来了——这是核心闭环（写→反馈→档案）里最贵的一次数据丢失。

**修复**：
1. 新增 action `regenerateFeedback(submissionId)`：读 submission+task，跑 `generateFeedback`，update submission + 插入 errors（先删除该 submission 已有 errors 再插，保证可重入）。
2. 反馈页 `feedback === null` 时渲染一个居中卡片："Feedback generation failed" + Retry 按钮调用该 action。

### 5. AI 返回的 span 偏移未做服务端校验，高亮可能错位或整条丢失

**位置**：[tasks.ts:163-179](src/lib/actions/tasks.ts:163)、[submission-text.tsx:25-41](src/app/(main)/practice/[submissionId]/feedback/_components/submission-text.tsx:25)

LLM 的字符偏移是出了名的不可靠。当前只做了边界 clamp（`Math.max(0,...)`/`Math.min(len,...)`），没有验证 `contentFr.slice(start, end) === original`。错位的 span 会导致：① 中栏高亮到错误的文字；② `submission-text` 里重叠 span 被静默丢弃（`start < pos` continue），右栏有错误卡片但正文里找不到对应高亮。

**修复**：入库前做一次 span 修复（这也是 S4 反馈质量最划算的一次改进）：
```ts
function repairSpan(content: string, err: FeedbackError) {
  const { start, end } = err.span;
  if (content.slice(start, end) === err.original) return { start, end };
  const idx = content.indexOf(err.original);         // 全文唯一出现则采用
  if (idx !== -1 && content.indexOf(err.original, idx + 1) === -1)
    return { start: idx, end: idx + err.original.length };
  return { start, end }; // 修不了保持原样，但可打 log 观察 AI 错位率
}
```

### 6. （未提交改动）subjonctif 的人称会重复渲染

**位置**：[verb-tenses.tsx:39-45](src/app/(main)/vocabulary/_components/verb-tenses.tsx:39)、[enrich.ts](src/lib/ai/enrich.ts) 新 prompt

新 prompt 要求 subjonctif 的 form "prefix each form with que/qu'"，而 Forms 的固定键是 `je/tu/il/...`。渲染是 `{person} {form}`，结果会显示 **"je que je sois"**。

**修复**（二选一，推荐 A）：
- A. prompt 改为 forms 只存动词形式（"sois"），渲染时对 subjonctif tense 加 "que " 前缀（display 层处理，数据干净，将来 drill 也好用）。
- B. subjonctif 渲染时隐藏 person 标签。

### 7. （未提交改动）旧的 richEntry 数据与新 schema 不兼容，名词丢失阴阳性显示

**位置**：[enrich.ts](src/lib/ai/enrich.ts) 新 schema vs 存量 `vocabulary_lookups.richEntry`

新 schema 把顶层 `gender` 移进 `noun` 子对象，并新增 `register/note/noun/adjective/...`。存量已 enrich 的行是旧结构：旧名词条目有顶层 `gender` 但没有 `noun` 子对象 → **新 UI（PosDetails）对老数据什么都不显示，阴阳性信息从界面上消失**。旧 subjonctif forms 的键还是 `que_je/...`，新 UI 按值过滤能容错但显示混杂。

**修复**：写一个小脚本对 `enriched_at is not null` 的行批量重新 enrich（几十个词、gpt-4o 下大约几毛钱），一次性把存量数据迁到新结构；或者更省钱：提交这批改动时把 `richEntry` 加版本字段，UI 检测旧版本时显示 "Re-enrich" 按钮。批量重 enrich 更干净。

### 8. Quiz 导入的 section 恒为 "reading"

**位置**：[import-dialog.tsx:34](src/app/(main)/quiz/_components/import-dialog.tsx:34)、[quiz-parse.ts:9](src/lib/ai/quiz-parse.ts:9)

`Meta.section` 类型硬编码 `"reading"`，`parseQuizFromText(text, "reading")` 也是。schema 里 `quiz_section` 有 6 个值，UI 上导入语法/词汇卷会全部入库为 reading，列表筛选会归错类。如果近期只导阅读卷这是已知取舍，但至少 UI 不应暗示支持其他 section。

**修复**：dialog 表单加 section 下拉（reading/grammar/vocabulary），透传给 `parseQuizFromText`（prompt 里的 "${section} comprehension" 本来就参数化了）。

---

## P1 — 可靠性 / 数据完整性

### 9. 多表写入没有事务，失败会留孤儿数据

**位置**：[quiz.ts:82-130](src/lib/actions/quiz.ts:82)（set→passages→questions 三层循环插入）、[cloze.ts:111-159](src/lib/actions/cloze.ts:111)、[vocabulary.ts:56-68](src/lib/actions/vocabulary.ts:56)（entry→alias→occurrence）

中途失败（网络抖动、约束冲突）会留下没有题目的空 set、缺 alias 的词条。**修复**：包 `db.transaction(async (tx) => {...})`，循环插入顺便可以合并为批量 values。

### 10. 阅读时长在关标签页时丢失；dev 下每次打开建两条 session

**位置**：[reader-client.tsx:39-49](src/app/(main)/documents/[id]/_components/reader-client.tsx:39)

- 卸载回调里调用 server action 刷新时长——**直接关标签页/关浏览器时请求发不出去**，durationSeconds 永远是 0。
- React StrictMode 下 mount effect 跑两次 → dev 环境每次阅读建 2 条 reading_sessions。
- 只要打开页面 2 秒也会留下一条 session，统计里全是噪音。

**修复**：
1. 心跳式落盘：`setInterval` 每 30–60s 调一次 `updateSessionDuration`（幂等 update，天然抗关页）。
2. session 懒创建：首次查词或停留超过 15s 才创建，避免噪音；同时用 ref 防 StrictMode 重复创建。

### 11. 保存词汇后的 enrich 是 "裸" fire-and-forget

**位置**：[vocabulary.ts:87](src/lib/actions/vocabulary.ts:87)

`void enrichEntry(lemma).catch(() => {})` 在 server action 响应结束后继续跑——Next 不保证响应后的工作能完成（自托管 node 通常没事，但语义上是碰运气）。**修复**：用 Next 的 `after()`（`next/server`）注册响应后任务，这是官方为这个场景提供的 API；失败时至少 `console.error` 留痕，别完全吞掉。

### 12. 词表页把整张表（含大 jsonb）拉进内存

**位置**：[vocabulary.ts:109-113](src/lib/actions/vocabulary.ts:109)（`select()` 全列）→ [vocabulary/page.tsx](src/app/(main)/vocabulary/page.tsx)

列表只需要 6 个摘要字段，却把每行的 `richEntry`（动词条目几 KB）全部传输一遍。词到几百个之后页面明显变重。**修复**：`db.select({ lemma, surface, pos, cefrLevel, translation, savedAt, enrichedAt })`，摘要在 SQL 层完成。

### 13. 输入校验缺口（单用户环境下低危，但都是一行的事）

- [reading.ts:36-44](src/lib/actions/reading.ts:36) `updateReadingProgress` 不 clamp：`Math.min(100, Math.max(0, Math.round(progress)))`。
- [quiz.ts:136](src/lib/actions/quiz.ts:136) `submitQuizAttempt` 不校验 `0 ≤ score ≤ total`。
- [cloze-runner.tsx:188](src/app/(main)/quiz/[setId]/_components/cloze-runner.tsx:188) `accepted[0]` 可能为 undefined（answer 数组为空时显示 "Correct spelling: undefined"）。

### 14. 查词弹窗的竞态：快速连续选词会闪现旧词结果

**位置**：[word-lookup-popover.tsx:52-71](src/components/word-lookup-popover.tsx:52)

连续选 A、B 两个词：A 的响应后到时只检查 `phase !== "hidden"`，会把正在加载的 B 覆盖成 A 的卡片，随后又跳回 B。**修复**：闭包里记 `const requested = sel.text`，setState 回调里核对 `p.phase !== "hidden" && p.word === requested` 才写入；或用递增的 request id。

---

## P2 — 性能

### 15. `listErrors` 的 errorIndex 计算是 N+1 查询

**位置**：[errors.ts:112-120](src/lib/actions/errors.ts:112)

对每个 submissionId 单独发一条查询算序号。Progress 页 `limit: 200` 时可能是几十条串行查询——这是全站最重的页面，randomly slow 的主因。**修复**：一条查询取回所有相关 span：
```ts
const allSpanRows = await db
  .select({ id: errors.id, submissionId: errors.submissionId, spanStart: errors.spanStart })
  .from(errors)
  .where(inArray(errors.submissionId, submissionIds))
  .orderBy(errors.submissionId, errors.spanStart);
// JS 里按 submissionId 分组编号
```
顺带：前面的 submissions/tasks/documents 三连查可以用两个 join 合成一条。

### 16. 缺索引：Postgres 不会自动给外键建索引

**位置**：[schema.ts](src/lib/db/schema.ts)

高频过滤/join 列全部无索引：`errors.submission_id`、`errors(category, subcategory)`、`errors.created_at`（trend/dashboard 每次全表扫）、`submissions.task_id`、`quiz_passages.set_id`、`quiz_questions.passage_id`、`quiz_attempts.set_id`、`tcf_questions.set_id`、`vocabulary_occurrences.lemma`、`micro_drills.error_id`、`conjugation_attempts(verb, tense)`。单用户数据量小暂时无感，但都是 on delete cascade 的外键，删除时也要全表扫。**修复**：schema 里补 `index()` 定义 + `npm run db:generate` 一次迁移全加上。

### 17. 动词表格索引每次请求全量重建

**位置**：[conjugation.ts:101, 155-174](src/lib/actions/conjugation.ts:101)

`buildFormIndex()` 每次 `getDrillQueue` 调用都对 30 个动词 × 6 时态 × 6 人称跑 conjugate（≈1000+ 次），结果是纯静态的。**修复**：模块级懒加载缓存：
```ts
let formIndexCache: Map<string, string> | null = null;
const getFormIndex = () => (formIndexCache ??= buildFormIndex());
```

### 18. `getConjugationStats` 全表拉行、JS 聚合

**位置**：[conjugation.ts:281-311](src/lib/actions/conjugation.ts:281)

练得越多越慢。**修复**：SQL `GROUP BY verb, tense` + `count(*) filter (where correct)`。

### 19. `getErrorTrend` 不补零周，折线图会 "跳周"

**位置**：[errors.ts:337-361](src/lib/actions/errors.ts:337)

没有错误的周直接缺失，图上相邻两点可能隔了三周，视觉上误导进步幅度。**修复**：在 JS 里按窗口生成完整周序列，缺的周填 0。

### 20. 其他小的查询效率项

- [errors.ts:377-416](src/lib/actions/errors.ts:377) `getTopRecurringPatterns`：每组一条 example 查询（N+1，N=3），可用 `DISTINCT ON (category, subcategory) ... ORDER BY created_at DESC` 一条搞定。
- [quiz.ts:189-199](src/lib/actions/quiz.ts:189) `listQuizSets` 拉全部 attempts 只为取每组最新一条，可 `DISTINCT ON (set_id)`。
- [documents.ts:66](src/lib/actions/documents.ts:66) `createDocument` 同步等 AI 估级才返回——保存文档要等 1-2s。可先按 `naiveLevelEstimate` 入库立即返回，`after()` 里跑 LLM 估级再 update。

---

## P3 — 死代码 / Schema 债务 / DRY

### 21. 死代码（建议直接删）

- **`reading_sessions.vocabularyLookedUp`**（[schema.ts:53](src/lib/db/schema.ts:53)）：只在 `createReadingSession` 初始化为 `[]`，从不追加、从不读取——已被 `vocabulary_occurrences` 取代。删列 + 删初始化。
- **`vocabulary_lookups.reviewCount`**（[schema.ts:189](src/lib/db/schema.ts:189)）：全库无读写。是 SRS 的占位就加注释说明，否则删。
- **`getProgressStats`**（[errors.ts:183-195](src/lib/actions/errors.ts:183)）：无调用方（已被 `getDashboardStats` 取代），且它的 `totalSubmissions` 语义其实是 "有错误的 submission 数"，留着容易误用。删。
- **`LearnerProfile.masteredVocab`**（[learner-profile.ts:121-160](src/lib/actions/learner-profile.ts:121)）：每次构建 profile（每次生成任务/选空）都拉 50 篇 submission 全文 + 全部 error span 做分词计算，**结果无任何消费方**。而且算法上它收集的是 "最近写过且不在错误 span 里的 token"，绝大多数是 les/de/que 这类功能词，即便将来要用也不可用。删掉计算和字段；将来真要 "掌握词汇" 应该从 vocabulary_lookups 出发。

### 22. Schema 风格不统一（趁表还少统一掉）

- 旧表 `text` PK + 应用层 `randomUUID()`；TCF 表 `uuid` PK + `defaultRandom()`。
- 旧表 `timestamp`（无时区）；TCF 表 `withTimezone: true`。Azure PG 固定 UTC 暂时无害，但两种精度/语义混用迟早咬人。
**建议**：定下 "新表一律 uuid PK + timestamptz"（口语功能的计划已按此写）；旧表不动，等有实质 schema 改动时顺路迁。

### 23. jsonb 列大多没有 `.$type<>()` 注解

`targetWords`、`targetGrammar`、`praise`、`frExamples`、`examples`、`options`、`answer`、`feedbackJson`… 全是 `unknown`，调用方到处 `as string[]`。**修复**：schema 里逐个补 `$type<string[]>()` / `$type<FeedbackResult>()`，一次把散落的 as 断言清掉。

### 24. exam-runner 与 drill-runner 约 60% 重复

**位置**：[exam-runner.tsx](src/app/tcf/_components/exam-runner.tsx)、[drill-runner.tsx](src/app/tcf/_components/drill-runner.tsx)

`LEVEL_COLORS`、`TYPE_LABELS`、题卡渲染（图片/passage/音频/选项字母/transcript）两份几乎一样的实现，改题型要改两处。**修复**：抽 `_components/question-card.tsx`（纯展示：question + 状态着色规则由 props 注入），两个 runner 只保留各自的导航/状态逻辑。

### 25. `rule_id` 白名单硬编码在 prompt 里，与 taxonomy 重复

**位置**：[feedback.ts:76](src/lib/ai/feedback.ts:76)

那串 37 个 id 就是 `ALL_SUBCATEGORIES` 的 key。加减 taxonomy 时这里必然忘改。**修复**：`ALL_SUBCATEGORIES.map(s => s.subcategory).join(", ")` 拼进 prompt。

### 26. AI 纯函数文件不应标 `"use server"`

**位置**：[lookup.ts:1](src/lib/ai/lookup.ts:1)、[transcribe.ts](src/lib/ai/transcribe.ts)、[cefr-estimator.ts](src/lib/ai/cefr-estimator.ts)、[quiz-parse.ts](src/lib/ai/quiz-parse.ts)、[cloze-select.ts](src/lib/ai/cloze-select.ts)

这些文件只被 server actions 调用，标了 `"use server"` 后每个导出函数都变成可从浏览器直接 POST 的公开端点（绕过 actions 层的校验和记录逻辑）。单用户本地跑无实害，但语义错误且白白扩大暴露面。**修复**：删掉这几个文件的 `"use server"`（真正的入口在 `lib/actions/` 已有）。CLAUDE.md 的架构图也是这么画的。

### 27. 小的重复定义

- `TcfLevel`/question type 联合类型在 [tcf.ts:7](src/lib/actions/tcf.ts:7) 手写，应从 schema enum 推导（`(typeof tcfLevelEnum.enumValues)[number]`）。
- `LEVEL_ORDER` 在 [display.ts:3](src/lib/vocab/display.ts:3) 与 CEFR 序还有 exam-runner 的 `LEVEL_ORDER` 数组语义重叠，可归到 `lib/cefr.ts`。

---

## P4 — 产品 / UX 建议

### 28. TCF 练习成绩完全不落库

exam-runner 算完分只放在 state 里，刷新即失；drill 的 done 状态只在 localStorage。你的核心产品理念是 "所有练习信号流入学习者档案"，但 TCF（目前用得最多的模块）是唯一游离在外的。**建议**：加一张 `tcf_attempts`（setId/skill/level/score/total/answeredAt + 可选 per-question 明细 jsonb），exam 交卷时写入；progress 页加 TCF 板块。这也是口语功能之前很好的热身改动。

### 29. Exam 模式没有计时器

真实 TCF 听力/阅读都有严格时限。加一个可选倒计时（听力 ~35min、阅读 60min），到时自动交卷——练出来的分数才有参考价值。

### 30. TCF drill 里查词弹窗不知道哪些词已保存

**位置**：[drill-runner.tsx:251-256](src/app/tcf/_components/drill-runner.tsx:251)

`savedLemmas={[]} onSaved={()=>{}}`——同一个词在 TCF 里再查一遍永远显示未保存。**修复**：drill 页服务端取已保存 lemma 列表传入（reader 页已有现成模式 `getSavedWordsByDocument`，这里用一个 `getAllSavedLemmas()` 即可）。

### 31. "Re-explain in this sentence" 的结果不回写缓存

**位置**：[vocabulary.ts:71-74](src/lib/actions/vocabulary.ts:71)

每次点击都重新花一次 AI 调用，结果只活在弹窗 state 里。**修复**：拿到新解释后 update `vocabularyLookups.inContext`（这本来就是 "最近一次语境解释" 字段的语义）。

### 32. 反馈生成同步阻塞提交按钮 20-40 秒

**位置**：[tasks.ts:118-189](src/lib/actions/tasks.ts:118)

submission 先落库的两阶段设计很好，但用户要盯着 spinner 等完整个 AI 反馈。**建议**（配合 #4 的 retry action 一起做）：insert 后立刻 `redirect`，反馈页对 `feedbackJson === null` 显示 "生成中…" 骨架并轮询/手动刷新，生成放 `after()`。写作提交的体感从 30s 变成 1s。

### 33. 错误档案列表上限 200 条且无分页

**位置**：[progress/page.tsx:48](src/app/(main)/progress/page.tsx:48)

超过 200 条后旧错误静默消失。近期不紧急，但在 errors 表加 `createdAt` 索引（#16）后加个 "Load more" 很便宜。

### 34. AI 成本微调

- [enrich.ts:117](src/lib/ai/enrich.ts:117) 词条 enrich 用 `MODELS.task`（gpt-4o）。这是结构化程度最高、发散度最低的任务，gpt-4o-mini 大概率够用（建议 A/B 抽查 10 个词对比）。每次保存词汇省 ~10x。
- `reexplainInContext` 走完整 lookup prompt 却只用 in_context 一个字段——配合 #31 回写后调用频率会降；也可以单独做一个只返回一句话的轻 prompt。

---

## 汇总：建议的执行顺序

| 批次 | 内容 | 工作量 |
|---|---|---|
| 快修（一次 PR） | #1 nulls last、#3 出处标题、#13 三个校验、#17 缓存、#25 prompt 去重、#26 删 use server、#21 删死代码 | 半天 |
| 反馈质量（一次 PR） | #4 retry action + UI、#5 span 修复、（可选 #32 异步化） | 半天–1 天 |
| 数据层（一次 PR） | #16 索引迁移、#9 事务、#15 N+1、#12 摘要查询、#19 补零 | 半天 |
| 词汇 WIP 收尾 | #6 subjonctif、#7 存量重 enrich，然后提交当前工作区改动 | 半天 |
| 产品向 | #2 TCF 链接、#28 tcf_attempts、#29 计时器、#30/#31 | 按需排期 |

未提交的 enrich 结构化改造方向本身是对的（strict structured outputs 换掉 `z.record` 是必要的），收尾 #6/#7 后建议尽快提交，避免和后续改动缠在一起。
