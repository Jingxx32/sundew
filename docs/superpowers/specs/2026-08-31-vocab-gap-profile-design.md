# 词汇缺口画像(user profile:听说读写词汇缺口 + 复习闭环)— 设计文档

日期:2026-08-31
状态:已实现(2026-08-31)。9 个任务全部完成并 push 到 origin/main,详见 `docs/superpowers/plans/2026-08-31-vocab-gap-profile.md` 顶部的完成状态与 commit 列表。

## 1. 概述

把分散在四处的学习信号(查词记录、写作批改错误、TCF 答题、口语评分)统一成一个
**以词汇/表达为核、按四技能维度记缺口**的 user profile,并让画像反向驱动练习。

用户表述的三类缺口,映射为三种 gap 类型:

- **不认识**(读也不懂)→ `recognition`
- **听不懂**(认识但听不出来)→ `listening`
- **不会用**(懂但写/说不出来)→ `production`

### 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 首要用途 | **驱动练习为主**:画像是数据层,喂给复习队列/malin 重刷/写作任务生成;看板可以后做 |
| 捕获方式 | **自动 + 手动并行**:查词、AI 批改自动汇入;TCF 页面加轻量手动标记 |
| 内容范围 | **词汇为核,四技能维度**:语法弱点(errors/taxonomy)与 TCF 考点(skill_tags)两套体系不动,只在展示/队列层汇总;本期接通听力+阅读+现有写作流,口语/TCF 写作留接口 |
| 消费端 | 三个全做,分期:词汇复习队列(Leitner)→ TCF malin 加权 → AI 写作任务注入 |
| 方案选择 | 方案 A「缺口层」:新表叠在现有 lemma 记忆上,不动 `vocabulary_lookups` / `tcf_question_attempts` / `tcf_attempts` |
| 画像自主权 | 用户可手动改缺口类型、标已掌握、移除误标;被移除的缺口自动信号不再重建(软删除 `dismissed`) |

### 与 TCF 重刷记忆的关系

本设计不碰 `tcf_question_attempts` / `tcf_attempts` / `tcf_questions`。已知既有边界:
重导试卷会级联清掉指向该卷题目的 `vocabulary_occurrences`(出处链接),但缺口行按
lemma 存,词条缺口与复习进度不受影响。

## 2. 数据模型

新表 `vocabulary_gaps`(新表规范:uuid PK + timestamptz):

```
id                uuid PK defaultRandom
lemma             text NOT NULL → vocabulary_lookups(lemma) ON DELETE CASCADE
gap_type          enum vocab_gap_type: 'listening' | 'recognition' | 'production'
source            enum vocab_gap_source: 'lookup' | 'feedback' | 'manual'
status            enum vocab_gap_status: 'active' | 'mastered' | 'dismissed'
box               integer NOT NULL default 1      -- Leitner 盒 1–5
due_at            timestamptz NOT NULL defaultNow -- 下次复习时间
last_reviewed_at  timestamptz NULL
created_at        timestamptz NOT NULL defaultNow

唯一约束:(lemma, gap_type)
索引:(status, due_at) — 复习队列查询
```

规则:

- 缺口指向 lemma。标记一个未入库的词时,先走现有 cache-first 查词管线建词条
  (自动拿 lemma 归一 + 翻译),再 upsert 缺口行——手动标记顺便完成查词。
- Leitner:答对 → box+1,间隔 1/2/4/8/16 天推 due_at;box 5 再答对 → `mastered`;
  答错 → 回 box 1、due 明天。
- `mastered` 的词再次被查词/标记 → 重新激活回 box 1(视为遗忘)。
- `dismissed`(用户手动移除):自动汇入(lookup/feedback)跳过 dismissed 行不重建;
  手动标记可复活为 active box 1。
- upsert 幂等:同 (lemma, gap_type) 重复信号只刷新时间与来源,不建新行。

## 3. 捕获入口

### 3.1 自动汇入(不加 UI)

1. **查词 → `recognition`**:现有查词 action(`src/lib/actions/vocabulary.ts`)
   落库成功后 upsert 缺口行,`source='lookup'`。所有查词入口自动生效。
2. **AI 写作批改 → `production`**:批改产出的词汇类错误(taxonomy 词汇大类)
   若能定位到具体法语词,lemma 化后开缺口,`source='feedback'`。只在写作流加钩子,
   不改批改逻辑。

### 3.2 手动标记(TCF 页面)

在阅读原文(`reading-passage`)与听力 transcript 区域,选中文本后浮现**轻量标记浮标**
(不是被移除的查词弹层——标记不展示词典内容,不打断刷题节奏):

- **阅读题**:「不认识」(默认高亮)/「不会用」
- **听力题**:「不认识」/「听不懂」(默认高亮)/「不会用」

点击 → fire-and-forget:查词管线建词条 + upsert 对应缺口(`source='manual'`)+
写一条 `vocabulary_occurrences`(带 `tcf_question_id`)。UI 给 ✓ 即收起。

普通阅读页(documents)不加新 UI,查词本身就是自动信号。

成本:标记触发的查词走 cache-first,新词一次 gpt-4o-mini(≈$0.0002/词),忽略不计。

## 4. 复习队列(P2)

页面 `/review/vocab`(挂在 practice IA 的 drills 分组)。Server component 取
`status='active' AND due_at <= now()`,join 词条元数据,due_at 升序,每日上限 20(可调)。

按缺口类型出题,全部本地生成,不调 AI:

| 缺口 | 题型 | 素材 |
|---|---|---|
| `recognition` | 看词选义:法语词 + 4 个中文释义 | 干扰项从其他词条 translation 随机抽 |
| `listening` | 听音辨词:TTS 放词/例句,4 个法语词选项 | 先用浏览器 SpeechSynthesis(零成本),后可换 TTS 管线 |
| `production` | 中译法填空:例句挖掉目标词 + 中文释义,键盘输入 | 例句取 `sentenceContext`/`examples`,缺则退化为看中文写词 |

- 即答即写:对错 → 按 §2 规则更新 box/due_at,写回同一行,无新表。
- production 判定:NFC lowercase 比较,变位允许命中 lemma 或原 surface;不做 AI 判卷。
- 空状态:「今日无复习」+ 下一批到期时间。做完显示汇总(对/错/升盒数)。

### 4.1 画像自管理

- **复习卡片操作**:「已掌握」(直接 `mastered`,跳出循环)/「误标,移除」(置 `dismissed`)。
- **词条管理列表**:复习页下方折叠区「全部缺口词条」,按类型筛选,行内可改缺口类型、
  标已掌握、移除。不做独立路由。

## 5. 反向驱动(P3)

### 5.1 TCF malin 加权

错题闭环 spec(2026-07-06)§5 排序器的预留接口上加一条:题目若通过
`vocabulary_occurrences.tcf_question_id` 关联着活跃缺口词(用户曾在该题标记且未掌握),
同优先级组内提前。纯 JS 内存打分。词条 mastered 后加权自动消失。

### 5.2 写作任务注入

现有链路 `learner-profile.ts` → `ai/task.ts`。扩展:取最多 5 个活跃 `production`
缺口词(box 低、标记久优先)注入任务生成 prompt,要求任务自然诱导使用;任务页展示
目标词 chips;批改发现用对了 → 该缺口行记一次复习通过(box+1)。
词条注入独立于语法画像的 `hasEnoughSignal` 门槛,有词就注入。

## 6. 错误处理

- 标记/自动汇入:fire-and-forget + `.catch`(与 TCF 落库同模式),不打断练习。
- 查词管线失败:缺口行不建,浮标提示可重试。
- upsert 幂等,重复标记不重复建行。
- 复习页写回失败:UI 提示,当题不推进。

## 7. 测试 / 验证

无测试套件,真实数据验证(每期结束跑一遍并展示结果,不以 tsc/lint 为完成标准):

1. P1:TCF 听力/阅读各标记几个词 → 查库确认词条 + 缺口行 + occurrence;重复标记
   确认幂等;查词/写作批改各触发一次自动汇入。
2. P2:队列出题覆盖三种题型;答对/答错后查库看 box/due_at;「已掌握」「移除」生效;
   dismissed 的词查词不重建缺口。
3. P3:标记过词的题在 malin 模式排序提前;写作任务 prompt 里出现目标词,
   用对后 box+1。

## 8. 实施顺序

1. **P1 数据层 + 捕获**:migration(新表 + 3 enum)→ 自动汇入两条钩子 → TCF 标记浮标
2. **P2 复习队列**:三种题型 + Leitner 写回 + 自管理操作
3. **P3 反向驱动**:malin 加权 + 写作任务注入

## 9. 明确不做(本期)

- 口语 / TCF 写作模式的汇入(模型已兼容,上线时加钩子即可)
- 独立的词表浏览路由(复习页内折叠列表先行)
- AI 判卷、AI 生成复习题
- 语法弱点 / TCF 考点与词汇缺口的模型合并(维持三套体系,只在消费层汇总)
- 统一 profile 看板页(画像先驱动练习,可视化后做)
