# 语法知识点模块（Grammar Reference）— 设计文档

日期：2026-07-10
状态：设计已与用户确认，待审阅

## 1. 概述

新增一个 A2–B1 语法参考库：约 60–80 个知识点，英文讲解 + 法语例句（英文对照）。知识点体系（大纲）基于 CEFR 官方 A2/B1 语法清单人工整理、进 git 可审；内容由 AI 按大纲批量起草，全部以 **draft（未核实）** 状态入库，用户在阅读页里**边学边核**——直接编辑、逐条标记「已核实」。

现状缺口：`rules` 表（~33 条，按错误分类法子类各一条）只服务错误卡片的附属讲解，没有独立浏览入口，且「错误视角」的划分不等于语法书目录。

## 2. 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 模块形态 | A（参考库）为主，B（配套练习）以后再加，本期只留挂载点 |
| 知识点体系 | 独立语法大纲（非错误分类法骨架），通过映射字段与分类法相通 |
| 内容来源 | 方法 C：CEFR 官方 A2/B1 语法清单搭骨架 + AI 起草 + 人工校对（用户无自有教材 PDF）。**2026-07-11 修订：起草在外部 AI 工具完成（不使用用户的 OpenAI API），经 markdown 笔记导入** |
| 讲解语言 | 英文讲解（与现有 `rules.descriptionEn` 一致），法语例句附英文对照 |
| 覆盖范围 | A2–B1 核心，约 60–80 个知识点；B2 以后增量补 |
| 校对流程 | 不做批量前置校对；批量起草入库为 draft，应用内「边学边核」，阅读页内嵌编辑 + 标记已核实 |
| 笔记结构 | **2026-07-11 修订**：在 Explanation 与 Examples 之间加独立 **Common mistakes** 区块（✗ 错误写法 → ✓ 正确写法 + 一句原因，2–4 组，结构化存储）。理由：本产品以错误闭环为核心，✗→✓ 对照与错误卡片（原文划线 → 更正）用同一套视觉语言渲染 |
| `rules` 表 | 不动，继续服务错误反馈流程；两套体系通过 taxonomy 映射间接相通 |

## 3. 数据模型

### 3.1 新表 `grammar_points`

走新表约定（uuid PK `defaultRandom()` + `timestamp(..., { withTimezone: true })`）：

```
id                      uuid PK, defaultRandom
slug                    text NOT NULL UNIQUE     -- 稳定键，如 'passe-compose-vs-imparfait'；URL 与幂等导入用
name                    text NOT NULL            -- 英文标题
level                   text NOT NULL            -- 'A2' | 'B1'
category                text NOT NULL            -- 教学分组（约 7–8 组），如 Articles & Nouns / Pronouns / Verb Tenses / Moods / Sentence Structure / Prepositions / Agreement
order_index             integer NOT NULL         -- 组内排序
summary                 text NOT NULL            -- 一句话概要
description_en          text NOT NULL            -- 正文，Markdown
examples                jsonb                    -- { fr: string, en: string }[]
common_mistakes         jsonb                    -- { wrong: string, right: string, note: string }[]（2026-07-11 加）
taxonomy_subcategories  jsonb                    -- string[]，映射 ERROR_TAXONOMY 叶子子类键（多对一，可为空数组）
status                  text NOT NULL            -- 'draft' | 'verified'，默认 'draft'
verified_at             timestamptz NULL
created_at / updated_at timestamptz NOT NULL
```

索引：`slug` unique；`(category, order_index)`。

### 3.2 大纲文件 `src/lib/grammar-outline.ts`

进仓库、可审。每条含 `slug / name / level / category / orderIndex / taxonomySubcategories`。大纲由实现者基于 CEFR A2/B1 语法清单起草，**用户只审这份清单**（远轻于审 80 条内容）。大纲是知识点体系的唯一权威来源；AI 只负责「写讲解」，不决定「学什么」。

## 4. 内容生产管线

> **2026-07-11 修订**：应用户要求，**不使用用户的 OpenAI API** 生成内容。原「脚本调 OpenAI 起草」改为：Claude 提供结构化 prompt（`docs/grammar-notes-prompt.md`，含 8 个批次的知识点清单），用户在任意外部 AI 工具中生成语法笔记，存入 Notion 或 Obsidian；`scripts/import-grammar-points.ts`（npm script `grammar:import`）解析笔记 markdown 并入库。

不变的要点：

- 幂等：按 slug 跳过库里已有条目，可分批多次导入
- 以 `status = 'draft'` 入库；name/level/category/taxonomy 映射一律以大纲文件为准（笔记只提供 summary / 正文 / common mistakes / 例句）
- 单条解析失败报告并跳过，不中断整体

## 5. 页面与交互

侧边栏 Vocabulary 旁新增 **Grammar** 入口。两个页面（`src/app/(main)/grammar/`）：

### 5.1 `/grammar` 列表页

- 按 `category` 分组展示，每条：名称 + 等级章（A2/B1）+ 未核实标记（draft 才显示）
- 顶部：核实进度（如 "12/72 verified"）+ 客户端搜索框（~80 条内存过滤）

### 5.2 `/grammar/[slug]` 详情页

- 标题、等级、正文（渲染 Markdown）、例句列表（法语 `font-serif`，英文对照）
- **Common mistakes** 区块（正文与例句之间）：✗ 错误写法（划线、danger 色）→ ✓ 正确写法（success 色）+ 一句原因——与错误卡片同构的视觉语言
- **"Your errors on this point"** 区块：按 `taxonomy_subcategories` 查 `errors` 表（`subcategory IN (...)`），显示错误总数 + 最近几条摘要
- **编辑模式**：点 Edit 后正文 / 例句 / 概要变为可编辑，保存走 server action
- **"Mark as verified"** 独立按钮：置 `status = 'verified'` + `verified_at`；列表页未核实标记随之消失

### 5.3 Server actions `src/lib/actions/grammar.ts`

`"use server"`：列表（含核实进度）、按 slug 取单条、更新内容、标记核实；写操作后 `revalidatePath`。

## 6. 与现有系统的边界

- `rules` 表与错误反馈流程不动
- 错误卡片反向链接到语法详情页：不在本期，是后续小增量
- 未来练习功能（B）：练习记录表挂 `grammar_point_id` 即可，本期 schema 无需预埋字段
- 不新建 API 路由，遵循「页面 → server actions → Drizzle」现有数据流

## 7. 验证方式

项目无测试套件。验证路径：

1. 大纲文件成稿 → 用户审清单
2. 管线先限量生成 2–3 条跑通（Zod 校验、幂等重跑）
3. 全量生成 → 浏览器过一遍列表页 / 详情页 / 编辑 / 核实 / 错误关联

## 8. 不做的事（本期）

- 配套练习题（B 方案）
- B2 及以上内容
- 批量校对后台 / 单独审核界面
- `rules` 表迁移或合并
- 错误卡片 → 语法详情页的反向链接
