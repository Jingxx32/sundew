# TCF 题目精讲入库（TCF Explanations）— 设计文档

日期：2026-08-13
状态：设计已与用户确认，待审阅

> **2026-08-25 修订（解耦 french-wiki / sundew）：** 本文档描述的"文件是真源、
> 数据库是投影"已被推翻。讲解现在**只存在数据库里**，`POST /api/tcf/explanations`
> 是唯一写入通路；`scripts/sync-tcf-explanations.ts`、`npm run tcf:explain-sync`
> 与环境变量 `TCF_EXPLANATIONS_DIR` 均已删除，lumiere 不再读写 french-wiki 仓库
> 里的任何目录。反向的 `npm run tcf:explain-export` 把库里讲解导成 markdown 存进
> gitignore 的 `data/tcf-explanations/`，那是**备份**，恢复靠重新 POST。
> 下文凡涉及文件真源、双写、sundew 的段落均按此理解。

> **2026-09-04 修订（篇幅与语言）：** 讲解正文改为**全英文**，重心从推演选项转到读懂
> 原文。§4.2 模板里的 `## 选项` 小节**废除**——它和 `## 速判` 的每选项一行逐字重复；
> 逐句精讲里也不再写「→ 排除 A/C」，只在决定答案的那一句下留一行标记。章节标题改用
> 英文（`## Verdict` / `## Translation` / `## Line by line` / `## Pattern`，可选的
> `## Takeaway` 一行封顶写跨题规律），`- 眼:` 改为 `- Key:`。
> `src/lib/tcf/parse-explanation.ts` 中英两套标题都认（大小写不敏感），所以此前写的
> 中文讲解不回改也不会丢 `translation_en` 或判定条。现行写作规范以 CLAUDE.md
> 「写入单题 TCF 讲解 → 讲解正文规范」为准。

> **2026-09-04 修订（听力讲解）：** 听力题按另一套模板写——阅读的模板假设「原文就在
> 眼前」，听力不成立，失败常发生在解码层（连诵、省音、缩合、同音撞车、数字与专名）
> 而不是理解层。差异有三处：新增 `## Transcript` 小节，**重排**库里那段 OCR 连体字
> （断说话人、断句、补标点），并在决定句和「会听成另一个词」的句子下挂 `- ↳ …` 的
> 嵌套列表项写听感（一题上限 3 行，常规联诵不标）；`## Pattern` 换成 `## Listen
> again`；`spoken_options` 与 `image` 两个题型没有可重排的原文，`## Transcript`
> 换成 `## Propositions`，逐个选项写。parser 与前端**未改动**——新小节对
> `parse-explanation.ts` 是透明的普通 markdown，`## Verdict` / `## Translation`
> 的解析照旧。完整规范见 CLAUDE.md「讲解正文规范 → 听力题的差异」。
>
> 同日修掉一个挡路的渲染 bug：`question-media.tsx` 的 image 分支直接 return 图片，
> 后面的音频分支永远到不了，导致 94 道「看图选四句话」的题只能看图、听不到音频
> （`audio_path` 一直是有的）。现在 image 分支返回图 + 播放器。

## 1. 概述

刷 TCF 题时点「Afficher réponse」，除了高亮正确选项，还要看到一篇**中文讲解 + 全题英文翻译**。讲解由用户与 Claude 在对话里逐题产出，写成 markdown 文件存在**仓库外的私有仓库**（见 §4.1），再由脚本同步进 `tcf_questions.explanation`，前端渲染。

现状缺口：`tcf_questions.explanation` 与 `translation_en` 两个字段建表时就留好了，但 3159 道题**全为 null**——解析器（`src/lib/tcf/parse.ts`）一律写 null，前端也从未渲染过这两个字段。

这条线与 french-wiki → sundew 的口语表达闪卡流水线相互独立，互不写入。

## 2. 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 存储形状 | 整块 Markdown 存进现有 `explanation` 字段。不做结构化 JSONB |
| 为什么不结构化 | 讲解含变位表、双语词条、⚠️ 提醒、句架，进固定 schema 会被切碎；且讲解格式仍在迭代，schema 会跟着反复改 |
| 选项级钉一句话 | **不做**。选项对错解析写在讲解正文里，整篇显示 |
| 真源 | 仓库里的 markdown 文件，数据库是派生物 |
| 为什么文件是真源 | `scripts/import-tcf-reading.ts:77` 重导一套题会先 `delete` 该套全部 question 再重插；讲解只写库会被静默抹掉且不可恢复 |
| 题目定位 | `test_number` + `skill` + `order_index`，即 `T1 CE Q5`。题干文字会跨套重复（"Quel est le passe-temps préféré de Julien ?" 在 test 1/9/31 各有一题），不能作主键 |
| 是否需要截图 | 阅读题不需要：`passage` 覆盖 1521/1521。听力 `transcript` 覆盖 1525/1638，缺的 113 题需截图。版面信息重要的图片题也需截图 |
| 触发条件 | 仅当用户说「今天我们来精讲TCF题目」之后才写文件与同步；其余对话只讲不存 |
| 批量回填 | 不做。一题一存，随讲随写 |
| 讲解语言 | 中文讲解 + 英文简释（用户明确要求），另含全题英文翻译区块 |
| `translation_en` 字段 | 本期由脚本从「全文翻译」区块顺手抽出填入；不填也不影响显示 |
| 词汇/语法点结构化 | 本期不做。以后若要接 `vocabulary_lookups` / `grammar_points`，再单独设计 |
| 讲解文件的存放位置 | 不放本仓库。`data/` 已 gitignore 且本仓库远程是 public GitHub，文件里含受版权保护的 TCF 原文，既不能入库版本控制也不能推公开仓；改放独立的私有仓库，脚本通过环境变量 `TCF_EXPLANATIONS_DIR` 定位（未设置时回退到仓库内 `data/tcf-explanations`，仅本地、不持久） |

## 3. 数据模型

**不新增表，不新增列。**

| 字段 | 用途 | 现状 |
|---|---|---|
| `tcf_questions.explanation` | 整篇讲解 Markdown（不含 frontmatter） | 已存在，全空 |
| `tcf_questions.translation_en` | 「全文翻译」区块正文 | 已存在，全空 |

定位键：`tcf_sets.test_number` + `tcf_sets.skill` + `tcf_questions.order_index`。

## 4. 讲解文件

### 4.1 路径与命名

讲解文件含受版权保护的 TCF 原文，不能放进本仓库（`data/` 已 gitignore，且本仓库远程是 public GitHub）。实际存放在仓库外的一个私有仓库里，脚本通过环境变量 `TCF_EXPLANATIONS_DIR` 指向该目录：

```
$TCF_EXPLANATIONS_DIR/CE-T1-Q5.md      # CE = reading（compréhension écrite）
$TCF_EXPLANATIONS_DIR/CO-T13-Q30.md    # CO = listening（compréhension orale）
```

`TCF_EXPLANATIONS_DIR` 未设置时回退到仓库内 `data/tcf-explanations`（与 `TCF_READING_DIR` 等其他 TCF 路径变量同一约定，见 `.env.example`），保证新 clone 也能跑；但该回退目录是本地、未跟踪的，不作为持久存储。

文件名即定位三件套，肉眼可读、可 grep。

### 4.2 结构

```markdown
---
test: 1
skill: reading
question: 5
written: 2026-08-13
---

## 全文翻译

**Question** — What is Julien's favorite hobby?

**Text**
> Hi Marc,
> I'm writing to you from Vancouver. …

**Options** — A. Reading · B. Cycling · C. Painting · D. Cooking

## 题干
…

## 信件 / 文件 / 广告
…逐句讲：词汇 / 语法点 / 时态 / 语用（空的板块直接省略）

## 选项
A. … ❌ 理由　B. … ✅ 理由　C. … ❌ 理由　D. … ❌ 理由

## 句架
…

**答案：B**
```

frontmatter 供脚本定位，不进数据库、不显示。frontmatter 之后的全文原样写入 `explanation`。

### 4.3 正文规范

- 板块：词汇 / 语法点 / 时态 / 语用 / 句架。**没内容的板块直接省略**，不为凑格式硬写。
- 词汇：每词一行，中文 + 英文简释；默认每词 0–1 个例句；易混词最多 1 组对比。
- 语法点：只写本句实际用到的，1–2 条。已讲过的规则一句话引用，不重开表格。
- 时态：只答「用了什么时态、为什么、排除了哪个备选」。
- 句架：只给 1 个模板。
- 「全文翻译」= 题干 + 原文 + 四个选项，三样都翻，置于全篇最前。

## 5. 同步脚本

`npm run tcf:explain-sync` → `scripts/sync-tcf-explanations.ts`

1. 目录取 `process.env.TCF_EXPLANATIONS_DIR`，未设置则回退到仓库内 `data/tcf-explanations`（见 §4.1）；目录不存在时打印清晰提示并 exit 0，不报 ENOENT 栈；
2. 扫该目录下 `*.md`；
3. 解析 frontmatter，按 `test + skill + question` 查 `tcf_sets` join `tcf_questions`；
4. 把 frontmatter 之后的全文写入 `explanation`，把「全文翻译」区块正文写入 `translation_en`；
5. 幂等：重跑只覆盖同一行，不产生重复；
6. 匹配不到的文件报错并列出，不静默跳过；
7. 题库重导后重跑一次，讲解全部恢复。

## 6. 前端显示

- 新增依赖：`react-markdown` + `remark-gfm`（讲解含表格，GFM 必需）。
- `src/app/tcf/_components/drill-runner.tsx`、`exam-runner.tsx`：揭晓答案后在选项区下方渲染 `explanation`。
- `explanation` 为空的题保持现状，不显示空容器。

## 7. 会话流程

```
用户：今天我们来精讲TCF题目          ← 闸门打开，本次会话有效
用户：T1 Q5
Claude：从库里取题干/原文/选项/答案 → 按 §4.3 讲解
        → 写 $TCF_EXPLANATIONS_DIR/CE-T1-Q5.md
        → 跑 npm run tcf:explain-sync
```

闸门未打开时正常讲解，**不写文件、不同步、不主动提议存储**。理由：用户同期还在学播客口语等其他材料，无差别捕获会把不属于任何题目的笔记灌进题库，且同步后难以撤销。

## 8. 明确不做

- 选项级钉一句话的结构化展示
- 词汇 / 语法点抽取入 `vocabulary_lookups` / `grammar_points`
- 批量回填历史题
- 改动 sundew，或改动 french-wiki 的口语闪卡流水线（`raw/` `wiki/` `learning/`）。french-wiki 现作为讲解文件的私有存放处（`tcf/explanations/`，见 §4.1），两条线除此之外互不相干

## 9. 风险与取舍

| 风险 | 处理 |
|---|---|
| 重导题库抹掉讲解 | 文件为真源，重导后重跑 sync 恢复 |
| OCR 出来的 `passage` 丢版面信息 | 遇到即要求截图；文件正文以截图为准 |
| 听力 113 题无 transcript | 同上，需截图 |
| 讲解格式后续再改 | Markdown 不锁格式，存储层无需改动 |
| 用户忘记说触发语 | 讲解照常给出但不落盘；用户随时可补说触发语，再要求把本次会话已讲的题补写入库 |
