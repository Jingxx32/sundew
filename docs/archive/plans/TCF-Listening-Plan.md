# TCF 听力刷题 — 实施计划 (Listening MVP)

> 这是 Lumière 里 **TCF 听力 (Compréhension orale)** 功能的施工图，由一系列设计讨论沉淀而来。
> 设计为"冷启动可执行"——不依赖聊天上下文。咱俩按这份文档一步步推进。
>
> Historical related documents: `docs/archive/PRD-v0.2.md` and `docs/archive/DevPlan-v0.2.md`. The full original design is in the `practice-ia-blueprint.md` memory.

---

## 0. 本次范围 (Scope)

**只做这些：**
- 仅 **听力 (Compréhension orale)**，阅读以后再说。
- 文本只读本地备考 PDF（自带 题/选项/答案/法文原文/中文翻译解析）。
- 先**提取入库**，**暂不生成语音 (TTS)**。
- 先做一个能 **在页面上逐题检查** 的界面；我（用户）确认页面没问题后，再做语音。

**明确暂不做（Deferred）：**
- 语音生成（TTS）→ 页面检查通过后才做。
- 英文翻译 / 解析 → 字段留空 (nullable)，以后逐条手动找 Claude 翻译填入；导入**不调用任何翻译 API**。
- 整套模考 + 计分 (`tcf_attempts`)、四色标记重做、逐题历史 → 后续阶段。
- 阅读 (Compréhension écrite)、口语、写作、变位、侧边栏整体分组重排。

---

## 1. 背景与设计决策 (Context)

整个 app 的练习体系骨架（已和用户敲定）：

- 导航分组：**输入**(阅读/听力) · **表达**(写作/复述, AI 批改) · **专项**(TCF/变位)。
- 两台引擎心智模型：**表达类**(产出→AI批改→学习档案) vs **客观题类**(自动判分)。TCF 属客观题类。
- **TCF 从原 Quiz 独立成页**（原 Quiz 拆分后只留播客听写 Cloze）。
- 原始数据**不迁移**：旧 TCF 行清掉，全部用新 `tcf_*` 表重新导入。

**TCF 的两种练习模式**（本次只先把"分等级刷题"的听力跑通）：

1. **分等级刷题（主力）**：`听力/阅读` → `A1–C2` → 每个等级把 40 套里该等级的题汇成一个池子，带"答过即计入"的进度。
2. **整套模考（次要，本次不做）**：选一整套做 39 题 = 模拟考试，出总分。

**关键交互（来自真实参考界面）：**
- 一次一题的**翻页式** + 左侧**按等级分组的题号导航**。
- 导航格子是"状态地图"：已答 / 当前 / （后续）四色标记。
- **「答案」开关** = 复习模式总闸：开 → 显示对错 + 你的选项 + 原文 + （后续）历史。

---

## 2. 数据来源与格式 (Data source)

**来源文件**：本地备考资料目录（由 `TCF_LISTENING_DIR` 指定，不入库），每套 1 个 PDF + 1 个整套 mp3，约 42 套。

**PDF 是可选中文字**（非扫描，~777 字/页），用项目现有 `pdf-parse` 即可抽取（同 `src/lib/pdf/extract.ts`）。

**每套 39 题，等级按题号位置确定**（无显式标注）：

| 等级 | 题号 |
|---|---|
| A1 | 1–4 |
| A2 | 5–10 |
| B1 | 11–19 |
| B2 | 20–29 |
| C1 | 30–35 |
| C2 | 36–39 |

> 用户当前 ~A2，先聚焦 1–19（A1+A2+B1）；文本可全 39 题都提取（不花钱），语音以后只先做 1–19。

**三种题型**（Q1–19 已实测验证）：

| 类型 `type` | 题号(test1) | 特征 | 需要 |
|---|---|---|---|
| `image` | 1–4 | "…correspond à l'image"，4 个选项是**听**的 | **图片** + 音频(4句) + 选项文字 |
| `spoken_options` | 5–10 | 听一句 + 4 个**听**的回应 | 音频(问句+4回应) + 选项文字 |
| `dialogue` | 11–19 | 听对话/独白 + 屏幕 4 个**文字**选项 | 音频(对话) + 文字选项 |

**每题可从 PDF 抽到：**
- 指令 (instruction) / 实际问题 (dialogue 类的句尾 "Quel est…?")
- 4 个法文选项 (options)
- **正确答案**：PDF 里有 `Correct answer` 英文标记 → **确定性提取，100% 可靠**，无需 AI
- **法文原文** (transcript)：喂 TTS + 复习展示
- 中文翻译/解析：**丢弃不存**

**音频组织**（本次不生成，仅备忘）：
- 版本2：每套**一个大 mp3**（~128kbps）。
- 版本1：**每题一个 mp3**（~97kbps），但覆盖不全。
- 决策：用 **OpenAI `gpt-4o-mini-tts`** 从法文原文生成 + 本地拼 1 秒静音（详见 §6）。

**图片**（image 类必需）：PDF 里是嵌入图，文字抽取拿不到。需 `pip install pymupdf` 按页抽图 → 存 `public/media/tcf/test{N}/q{NN}.png` → 库里记 `image_path`。**图和音频都不进 Postgres，只存路径。**

---

## 3. 数据库 Schema

新增 `src/lib/db/schema.ts`（Drizzle / PostgreSQL）。本次只需 **tcf_sets + tcf_questions**；responses / marks 放后续阶段。

```
enum tcf_skill        = listening | reading
enum tcf_level        = A1 | A2 | B1 | B2 | C1 | C2
enum tcf_question_type= image | spoken_options | dialogue
enum tcf_mark_color   = red | orange | blue | green   // 后续阶段才用

table tcf_sets
  id            uuid pk
  test_number   int            // 1–42
  skill         tcf_skill      // 本次固定 listening
  title         text           // 如 "Compréhension orale test 1"
  source        text           // 来源标签，如 "TCF Canada — local practice material"
  created_at    timestamptz default now()
  unique(test_number, skill)

table tcf_questions
  id            uuid pk
  set_id        uuid fk → tcf_sets(id) on delete cascade
  order_index   int            // 1–39
  level         tcf_level      // 按题号位置
  type          tcf_question_type
  question_text text           // 指令 / dialogue 的句尾问题
  options       jsonb          // string[4]（法文）
  answer        int            // 正确项 0-based 下标
  transcript    text           // 法文原文
  translation_en text  null    // 留空，以后手填
  explanation    text  null    // 留空，以后手填
  image_path     text  null    // image 类
  audio_path     text  null    // TTS 生成后填
  created_at    timestamptz default now()

// —— 以下后续阶段再建 ——
table tcf_responses        // 逐题作答历史（撑"做题历史"）
  id, question_id fk, chosen_index int, is_correct bool, answered_at
table tcf_question_marks   // 四色标记
  question_id pk/fk, color tcf_mark_color null, updated_at
```

迁移命令：改完 schema → `npm run db:generate` → `npm run db:init`。

---

## 4. 关键文件 (Files to touch)

| 文件 | 作用 |
|---|---|
| `src/lib/db/schema.ts` | 加 `tcf_*` 表 + 枚举 |
| `src/lib/pdf/extract.ts` | 复用（PDF→文字） |
| `src/lib/tcf/parse.ts` *(新)* | **确定性**解析器：文字 → 结构化题目（见 §5） |
| `src/lib/actions/tcf.ts` *(新)* | server actions：导入、按等级查询、进度 |
| `scripts/import-tcf-listening.ts` *(新)* | 批量导入脚本（吃 PDF → 调 parse → 写库 → 抽图） |
| `src/components/sidebar.tsx` | 加 `TCF` 入口 |
| `src/app/tcf/page.tsx` *(新)* | 分等级刷题首页（技能/等级卡 + 进度） |
| `src/app/tcf/drill/page.tsx` *(新)* | 单题播放器 / 检查页（见 §7） |
| `src/app/tcf/_components/*` *(新)* | 题号导航、题目卡、答案开关等 |
| `public/media/tcf/test{N}/` | 图片、（后续）音频文件 |

> 可参考但不直接复用：`src/app/quiz/[setId]/_components/quiz-runner.tsx`（选项渲染、对错高亮的写法可借鉴）。

---

## 5. 确定性解析器 (parse.ts) — 已验证

对 test 1 Q1–19 实测全中。核心逻辑（基于抽取后的纯文本）：

1. 按行首 `^\d+\.\s*(Ecoutez|Regardez|Lisez)` 切分出每题区块。
2. 去掉页码行 `-- N of 41 --`、中文行 (CJK)、占位行 (`Proposition`/`Réponse`)、`不正确`、`正确答案…`。
3. `type`：含 `image` → `image`；含 `propositions` → `spoken_options`；否则 `dialogue`。
4. `level`：按题号位置映射（§2 表）。
5. `answer`：找含 `Correct answer` 的选项行，取其行首字母 A/B/C/D → 0-3。
6. `options`：4 个法文 `A.–D.` 选项（去掉 `Correct answer` 标记）。
7. `transcript`：区块里其余法文行（对话/原文 + 句尾问题）。
8. `translation_en` / `explanation`：`null`。
9. `image_path` / `audio_path`：`null`（图在导入脚本里单独抽，音频后续）。

> 注意各题型选项位置不同：`dialogue` 的文字选项在指令后、原文前；`image`/`spoken_options` 的真实选项在 `不正确` 之后。

参考产物：`test1-q1-19.json`（项目根，已验证的提取样例）。

---

## 6. 语音生成 (TTS) — 页面检查通过后才做

- 模型 **`gpt-4o-mini-tts`**，voice `alloy`，`response_format: "wav"`。
- 节奏：每题**分段生成**（"Question N" / 选项 A / B / C / D 或 对话），用 **Python 标准库拼接 + 插 1 秒静音**（零额外依赖，不装 ffmpeg）。
- `image`/`spoken_options` 类：音频里念出 A/B/C/D + 各句；`dialogue` 类：只念对话原文。
- 数字改写成法语读法（如 `20h30` → "vingt heures trente"）。
- 成本：全 40 套前 19 题 ≈ **$5** 一次性；停顿是本地静音 → **不额外计费**。
- 语速：页面上加一个**变速按钮**（前端 `audio.playbackRate`），不在生成端处理。
- 产物存 `public/media/tcf/test{N}/q{NN}.mp3`，回填 `tcf_questions.audio_path`。

---

## 7. 检查页 (Review UI) — 本次的验收界面

目标：**我能在页面上逐题翻看、确认提取无误**（此时还没有音频）。

- 侧边栏新增 `TCF` 入口。
- `/tcf`：分等级刷题首页 —— 技能（暂只听力）+ A1–C2 六张等级卡，每卡显示进度（本阶段进度可先显示题数；"已答"统计等 `tcf_responses` 建好后再接）。
- `/tcf/drill?skill=listening&level=A2`：**单题播放器 / 检查页**
  - 左侧：按等级分组的**题号导航**（当前题高亮）。
  - 主区：题号 + 等级徽标、指令/问题、4 个选项、`image` 类显示图片、（音频位先放占位 "音频待生成"）。
  - **「答案」开关**：开 → 高亮正确项、显示 `transcript` 法文原文（`translation_en`/`explanation` 为空就先不显示或显示"待翻译"）。
  - 上一题 / 下一题。
- 用 `preview_*` 工具起本地 dev server 截图自检，再交给我在页面上看。

**✅ 检查点（Gate）：我在页面确认 Q1–19 内容正确后，才进入 §6 语音生成。**

---

## 8. 执行清单 (Step-by-step checklist)

> 咱俩按顺序勾。每步做完我在页面/数据上确认再走下一步。

- [ ] **A. Schema**：`tcf_skill/level/type` 枚举 + `tcf_sets` + `tcf_questions`；`db:generate` → `db:init`。
- [ ] **B. 解析器**：`src/lib/tcf/parse.ts`，把 §5 逻辑落地，对 test 1 输出 39 题结构。
- [ ] **C. 导入（无图无音频）**：`scripts/import-tcf-listening.ts` 吃 test 1 PDF → 写 `tcf_sets`+`tcf_questions`（`image_path/audio_path/translation_en/explanation` 全 null）。
- [ ] **D. 抽图**：`pip install pymupdf`，把 test 1 的 image 类（Q1–4）图抽到 `public/media/tcf/test1/`，回填 `image_path`。
- [ ] **E. 检查页**：侧边栏 `TCF` + `/tcf` 等级卡 + `/tcf/drill` 单题检查页（含答案开关、原文、图片、音频占位）。
- [ ] **🔍 检查点**：我在页面逐题核对 Q1–19 无误。
- [ ] **F. 语音**：§6 TTS 流程，先 test 1 的 1–19 题，回填 `audio_path`，页面接上播放器 + 变速按钮。
- [ ] **G. 批量**：确认单套全流程 OK 后，扩到其余各套（文本全 39 + 音频先 1–19）。
- [ ] **(后续) H**：`tcf_responses`（逐题历史）、四色标记 + 按色重做、整套模考计分。

---

## 9. 开放问题 (Open)

- 抽图后，**图片与题号的对应**靠"同页"判断，需在 test 1 上人工校验一次准确性。
- `dialogue` 类的"句尾问题"与"原文"如何切分（`question_text` vs `transcript`）——解析器先用"最后一个问句"启发式，页面检查时核对。
- 进度"已答"口径：答过一次即计入（已定），但需 `tcf_responses`（后续阶段）才能统计；检查页阶段进度可先只显示题量。
