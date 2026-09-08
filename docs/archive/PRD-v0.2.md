# Lumière — PRD v0.2 增补：客观题引擎 / 播客听写 / 动词变位

| 字段 | 内容 |
|------|------|
| **产品名** | Lumière |
| **文档版本** | v0.2（增补于 v0.1，不替换；v0.1 的强决策仍然有效） |
| **文档状态** | 起草，待评审后冻结 — 变更走文末变更日志 |
| **最后更新** | 2026-05-22 |
| **Historical prerequisite** | `docs/archive/PRD-v0.1.md` (v0.1 constitution), especially §§5, 8, 9, and 12 |
| **Historical companion plan** | `docs/archive/DevPlan-v0.2.md` (Sprints 8–10) |
| **目标读者** | 产品作者本人；后续将用 Fable 模型执行开发 |

---

## 0. 本文档定位

v0.1 已交付 MVP（Sprint 1–7）：阅读 → 查词 → 写作任务 → 结构化反馈 → 错误档案 → 进度看板的核心闭环已跑通。

v0.2 不动这条主闭环，而是**补齐两个 v0.1 故意没做的能力维度**：

1. **客观技能的针对性训练** —— 主闭环练的是「自由产出（写作）」，但法语还有大量**有标准答案**的技能需要刻意练习：阅读理解、听力、动词变位。
2. **听力输入** —— v0.1 完全没有听力。

本文档定义三个新功能，以及把它们统一起来、避免做成三个孤岛的架构。**本文档回答 Why / What；How 见 `DevPlan-v0.2.md`。**

沿用 v0.1 约定：**强决策** = 必须遵守；**弱决策** = 当前选择可迭代；**范围外** = 明确不做。

---

## 1. 执行摘要

v0.2 新增三个功能，但它们**共享同一条架构脊梁**：

> **客观题引擎（Quiz Engine）** —— 一个通用的「共享材料（passage）→ 挂若干道题（question）」的数据底座，题目类型与答案形态都是可扩展的。

三个功能都是这条脊梁的不同投影：

| 功能 | 材料来源 | 题型 | 音频方向 |
|------|---------|------|---------|
| **TCF 题库**（阅读/听力） | 你的备考 PDF | 单选（MCQ） | 听力：TTS（文字稿→音频，Azure） |
| **播客听写**（cloze） | 真实播客 URL | 填空（fill_blank） | ASR（音频→文字稿，Whisper） |
| **动词变位训练** | 你的错误档案 + 查词记录 | 填空（产出式） | 无 |

**统一带来的价值**：三者复用同一套表与答题 UI，且都能回连到 v0.1 的灵魂——**错误分类法 / 学习者档案**。这是 Lumière 区别于「又一个刷题 App」的根本。

---

## 2. 背景与问题陈述

### 2.1 v0.1 留下的缺口

| 缺口 | 现状 | v0.2 如何补 |
|------|------|------------|
| 听力输入完全缺失 | 只有阅读+写作 | TCF 听力（合成音）+ 播客听写（真实音） |
| 客观技能无刻意练习 | 写作反馈是自由产出，覆盖不到「阅读理解 / 听辨 / 变位」这类有标准答案的练习 | 客观题引擎 + 三种题型 |
| 变位是错误档案里的高频类别，但无处可练 | 反馈里指出变位错误，却没有 drill 让你巩固 | 错误档案驱动的变位训练 |

### 2.2 为什么是一条脊梁，而不是三个功能

三个功能表面差异大，但本质都是 **「一段刺激材料 + 一组带标准答案的题」**。如果分别建三套表、三套 UI，会造成：

- 重复的答题渲染 / 判分 / 进度逻辑；
- 音频处理散落各处；
- 最致命的——**与错误档案的连接被切断**，退化成普通刷题。

因此 v0.2 的**第一性原则**：先建通用引擎，三个功能都是它的薄薄一层。

> **强决策 D-0**：TCF / 听写 / 变位三者共用 `quiz_passages + quiz_questions` 两张核心表；题型差异通过 `question.type` + `question.answer`（jsonb）表达，不为单个功能分叉建表。

---

## 3. 统一架构：客观题引擎

### 3.1 核心抽象

```
quiz_set      一套/一组题（一套 TCF 卷 / 一段播客 / 一组变位 drill）
  └── quiz_passage   共享材料（一段阅读文 / 一段听力文字稿 / 一段播客转写）
        └── quiz_question  挂在材料下的题（单选 / 多选 / 判断 / 填空）
```

### 3.2 三个「通用接缝」（强决策）

为了让引擎不被 TCF 锁死、未来能装下 TEF/DELF 和任意题型，**现在就设计进**三个接缝（事后改表代价极大）：

- **接缝 1 — `quiz_sets.exam`**：考试体系标识（`'TCF'` / `'TEF'` / `'DELF_B1'` / `'podcast'` / `'conjugation'`）。多体系并存于一张表，列表页按 `exam + section` 筛。
- **接缝 2 — `section` 用宽枚举**：`reading | listening | grammar | vocabulary | dictation | conjugation`，加值时改枚举跑迁移即可。
- **接缝 3 — `question.type` + `question.answer`（jsonb）**：取代写死的 `correctIndex`，一处改动装下所有题型。

  | type | options | answer 形态 | 例 |
  |------|---------|------------|-----|
  | `single` | 4 选项 | 数字索引 | `2` |
  | `multi` | N 选项 | 索引数组 | `[0,3]` |
  | `true_false` | null | 布尔 | `true` |
  | `fill_blank` | null | 字符串或可接受答案数组 | `"allé"` / `["allé","allée"]` |

### 3.3 与错误档案的连接（强决策 D-1）

每个功能都必须**至少有一条回连错误档案/学习者档案的通路**，否则不予通过：

- **变位训练**：drill 内容由 `errors` 表中「动词形态/时态」类错误驱动——专挑你真错过的。
- **播客听写**：挖空的词由 AI 按教学点选择（动词词尾、连音处、易混同音词），优先覆盖你的高频错误类别。
- **TCF 题库**：做错的题归类到对应 taxonomy 子类，喂进进度看板。

---

## 4. 功能需求

### 4.1 客观题引擎 + 通用答题 UI（Sprint 8 地基）

**必须功能**
- 三张表（§5）+ 迁移。
- 列表页 `/quiz`：按 `exam + section` 筛选，显示每套完成情况。
- 答题页 `/quiz/[setId]`：按 `question.type` 分支渲染；Phase 1 只落地 `single`，其余题型留分支占位。
- 选答后即时判分 + 显示解析。

**强决策**
- D-2：答题渲染器以 `question.type` 为唯一分支依据，新增题型只加分支、不动表。

**范围外（v0.2 不做）**
- 间隔重复 / SRS 调度（变位见 §4.4 的弱决策）。
- 计时、模拟考分数换算、排行。

### 4.2 TCF 题库导入（Sprint 8 阅读 / Sprint 8.5 听力）

**阅读（CE）— PDF 导入**
- 上传 PDF → 抽文本（`pdf-parse`）→ AI 结构化成 `passages + questions`（Zod 约束）→ **预览确认** → 入库。
- 扫描件兜底：抽不出文本时提示「像扫描件，请手动粘贴」，走粘贴框。
- **弱决策 W-1**：自动视觉 OCR（扫描件）Phase 1 不做，作为 S8.5 增量。

**听力（CO）— 文字稿 + TTS 合成**
- 备考 PDF 通常含听力原文（script）；抽出文字稿 → **Azure AI Speech** 合成法语音频 → 存 `public/audio/{passageId}.mp3` → 回填 `audioUrl`。
- 语音 `fr-FR-DeniseNeural` / `fr-FR-HenriNeural`；走 REST API（不装 SDK）。
- 连音兜底：默认纯文本 SSML 处理必读连音；个别读错的句子用 `<phoneme>` IPA 强制。
- **强决策 D-3**：听力答案/题目以备考资料为准；TTS 只负责「让文字稿有声」，不参与判分。

**关键关卡（强决策 D-4）**：导入分「AI 解析预览」与「确认入库」两步。AI 把答案和题号对错位是最大风险，必须有人工核对关卡才写库。

### 4.3 播客听写（Cloze Dictation）（Sprint 9）

把真实播客转写成「听音频 → 填回被挖词」的听写练习。**它是引擎里 `fill_blank + audioUrl` 的组合，不是新系统。**

**必须功能**
- 输入一个**播客单集直链 mp3 URL** → 服务器 fetch → **Whisper 转写（开词级时间戳）** → AI 按教学点挖空 → 生成 `fill_blank` 题。
- 答题页支持**点空格只循环播放对应词/半句**（靠词级时间戳 `seek`）。
- 文字稿默认折叠，可展开对照。

**关键架构决策**
- **强决策 D-5**：**不存、不切音频**。播放时 `<audio src={原始URL}>` 从播客源流式播；只存「文字稿 + 词级时间戳」。零存储、零 ffmpeg。
- **强决策 D-6**：「切段」在文字稿/时间戳上做，音频文件整段不动，用 `currentTime` 跳读。
- `quiz_questions(fill_blank)` 增字段 `audioStart / audioEnd`（秒）——这是「循环重听某词」体验的命脉。

**范围 / 约束**
- **范围外**：**YouTube 及任何视频下载**——违反其 ToS，且需 yt-dlp+ffmpeg，是「省事」的反面。只做播客。
- **弱决策 W-2**：来源先支持「直链 mp3 URL」；RSS 订阅选集作为 S9.5 增量（需轻量 XML 解析器）。
- **已知墙**：Whisper 单文件 ≤ 25MB。Phase 1 限 25MB 内的单集/片段，或只转写前 N 分钟；任意长节目的自动切割（需 ffmpeg）Phase 1 不做。

**合规说明**：Lumière 为单用户自用应用，将你能合法访问的播客（公开 RSS/mp3 分发）转写为个人听写练习，属个人合理使用。不对外分发任何转写内容。

### 4.4 动词变位训练（Conjugation Drills）（Sprint 10）

**必须功能**
- drill 形态：给「原形 + 时态 + 人称」→ 用户**打出**正确变位（产出式，对齐 output-first 原则）。
- **错误档案驱动**：优先抽取 `errors` 表中动词形态/时态类错误涉及的动词与时态。
- 即时判分 + 正确形式 + 简短规则提示。

**强决策**
- **D-7**：变位答案来自**确定性数据源**（开源法语变位数据集 / 规则算法），**不用 AI 生成答案**——drill 在教「正确答案」，AI 偶发错读不可接受。AI 仅可用于出题挑选、不可定答案。
- **D-8**：变位 drill 必须能回连错误档案（练完更新该动词/时态的掌握情况）。

**弱决策**
- **W-3**：SRS / 间隔重复 Phase 1 不做，先做简单 drill（随机抽 + 错题优先）；调度子系统以后再加。
- **W-4（已定）**：变位数据源用 npm 库 `french-verbs` + `french-verbs-lefff`（Apache-2.0，基于 LEFFF，覆盖不规则与配合）。运行时计算，不建变位表，DB 只存 drill 记录。时态范围：présent / passé composé / imparfait / futur simple / subjonctif présent / conditionnel présent（6 个）。详见 DevPlan §S10。

**复用既有数据**：v0.1 查词弹窗（`lookup.ts`）已返回 présent 变位，是这块的数据雏形。

---

## 5. 数据模型

### 5.1 新增 / 扩展（在 `src/lib/db/schema.ts`）

```text
quizSectionEnum = pgEnum("quiz_section",
  ["reading","listening","grammar","vocabulary","dictation","conjugation"])
quizTypeEnum    = pgEnum("quiz_type",
  ["single","multi","true_false","fill_blank"])

quiz_sets
  id          text PK
  exam        text                      'TCF' | 'TEF' | 'podcast' | 'conjugation' ...   [接缝1]
  number      integer (nullable)        套号
  section     quiz_section                                                              [接缝2]
  title       text
  source      text (nullable)           来源资料 / 播客名
  createdAt   timestamp

quiz_passages
  id            text PK
  setId         text FK → quiz_sets (onDelete cascade)
  orderIndex    integer
  text          text                    阅读段落 / 听力文字稿 / 播客转写
  audioUrl      text (nullable)         TCF听力=本地mp3路径; 播客=原始远程URL
  sourceType    text (nullable)         'tts' | 'asr'        音频来历
  sourceUrl     text (nullable)         播客/资料出处
  mediaDuration integer (nullable)      秒
  segmentStart  integer (nullable)      从原音频切出的区间起（秒）
  segmentEnd    integer (nullable)      区间止（秒）
  createdAt     timestamp

quiz_questions
  id           text PK
  passageId    text FK → quiz_passages (onDelete cascade)
  orderIndex   integer
  type         quiz_type                                                                [接缝3]
  questionText text
  options      jsonb (nullable)         选择题选项; 填空题为 null
  answer       jsonb                    灵活答案（见 §3.2 表）
  explanation  text (nullable)
  audioStart   integer (nullable)       fill_blank: 被挖词在音频里的起（秒）
  audioEnd     integer (nullable)       fill_blank: 止（秒）
  createdAt    timestamp

quiz_attempts                            进度记录（弱决策 W-5: 建议建，见下）
  id          text PK
  setId       text FK → quiz_sets (onDelete cascade)
  score       integer
  total       integer
  answeredAt  timestamp
```

### 5.2 ER（文字版）

```
quiz_sets 1───* quiz_passages 1───* quiz_questions
quiz_sets 1───* quiz_attempts
（错误档案连接：quiz_questions.答错 → 归类到 taxonomy 子类 → errors/进度看板；
  conjugation drill ← errors 表 动词类错误）
```

### 5.3 关键设计决策

- **强决策 D-0**：三功能共用上述表，不分叉。
- **强决策 D-9**：`answer` 用 jsonb 承载多题型答案；判分逻辑按 `type` 分派。
- **弱决策 W-5**：建议建 `quiz_attempts`（轻量、为进度看板铺路）；若想更省，S8 可只读不写、S10 再补。

---

## 6. 决策登记（汇总）

| 编号 | 类型 | 决策 |
|------|------|------|
| D-0 | 强 | 三功能共用 `quiz_passages + quiz_questions`，不分叉 |
| D-1 | 强 | 每功能至少一条回连错误档案的通路 |
| D-2 | 强 | 答题渲染按 `question.type` 分支 |
| D-3 | 强 | TCF 听力 TTS 只发声、不判分 |
| D-4 | 强 | 导入分「解析预览 / 确认入库」两步 |
| D-5 | 强 | 播客听写不存不切音频，流式播 + 只存文字稿/时间戳 |
| D-6 | 强 | 切段在时间戳上做，音频整段不动 |
| D-7 | 强 | 变位答案用确定性数据源，AI 不定答案 |
| D-8 | 强 | 变位 drill 回连错误档案 |
| D-9 | 强 | `answer` jsonb + 按 type 判分 |
| W-1 | 弱 | 扫描件视觉 OCR 延后（S8.5） |
| W-2 | 弱 | 听写来源先直链 mp3，RSS 延后（S9.5） |
| W-3 | 弱 | 变位 SRS 延后，先简单 drill |
| W-4 | 弱→已定 | 变位数据源 = `french-verbs` + `french-verbs-lefff`（Apache-2.0，运行时计算，不建变位表）；时态 6 个 |
| W-5 | 弱 | 建议建 `quiz_attempts` |
| **待定-1** | — | 导入预览严格度：整体预览+确认（推荐，Phase 1）vs 逐题可编辑（延后） |
| **待定-2** | — | PDF 粒度：导入时手动选 `exam/section/number`（推荐）vs 从文件名推断 |

---

## 7. 范围外（v0.2 明确不做）

- YouTube / 任意视频下载与抓取。
- 任意长播客的自动音频切割（ffmpeg）。
- 扫描件自动 OCR（Phase 1）。
- SRS / 间隔重复调度。
- 写作 / 口语的客观题化（自由产出归 v0.1 `/practice` 反馈，不进引擎）。
- 多用户 / 鉴权 / 题库分享。

---

## 8. 环境变量 / 依赖增量

**新增环境变量**
```
# TCF 听力 TTS（Azure AI Speech）
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION

# 播客听写 ASR（复用 OPENAI_API_KEY）
OPENAI_MODEL_TRANSCRIBE   # 默认 whisper-1（或 gpt-4o-transcribe）
```

**新增依赖**
- `pdf-parse`（+ `@types/pdf-parse`）— S8，PDF 抽文本。
- `fast-xml-parser` — S9.5（RSS，可选）。
- **不引入** Azure SDK（用 REST）、**不引入** ffmpeg（Phase 1）。

---

## 9. 路线图（Sprint 概览）

| Sprint | 主题 | 交付 | 依赖 |
|--------|------|------|------|
| **S8** | 客观题引擎 + TCF 阅读 | 三表+迁移、PDF 导入、`/quiz` 列表与答题（single） | — |
| **S8.5** | TCF 听力 TTS | 文字稿→Azure 合成→音频播放 | S8 |
| **S9** | 播客听写 | 播客URL→Whisper→挖空、词级重听 | S8 |
| **S9.5** | 听写来源增强 | RSS 选集（可选） | S9 |
| **S10** | 动词变位训练 | 错误档案驱动 drill、确定性变位源 | S8、错误档案 |

See `docs/archive/DevPlan-v0.2.md` for detailed historical implementation steps.

---

## 10. 风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| AI 解析答案与题号错位 | 题库质量崩 | D-4 双步预览人工核对 |
| Whisper 25MB 上限 | 长播客转不了 | Phase 1 限短片段；ffmpeg 切割延后 |
| 真实语音转写不准 | 听写答案错 | 保留文字稿人工修正环节 |
| TTS 个别连音读错 | 听力发音误导 | `<phoneme>` IPA 兜底 |
| 远程播客 URL 失效 | 听写无法回放 | 个人自用可接受；后续加本地缓存兜底 |
| Azure DB 连接不稳（v0.1 已遇） | 迁移失败 | 迁移前确认连通；迁移幂等可重跑 |
| 变位 AI 生成答案出错 | 教错 | D-7 用确定性数据源 |

---

## 变更日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-22 | v0.2 起草 | 新增客观题引擎、TCF 题库导入、播客听写、动词变位四块需求；定义统一引擎与三个通用接缝；登记 D-0~D-9 强决策、W-1~W-5 弱决策、2 个待定项 |
