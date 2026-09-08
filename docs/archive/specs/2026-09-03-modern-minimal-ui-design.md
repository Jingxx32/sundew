# 现代极简 UI 改版(复古暖米/衬线 → 冷中性/无衬线)— 设计文档

日期:2026-09-03
状态:设计已确认,待实施。

## 1. 概述

把 Lumière 从「暖米底 + 衬线 + 法式蓝主色」的复古学院风,改成「冷中性浅灰底 +
纯白无边框卡片 + 无衬线收紧排版 + 黑色主操作」的现代极简风。

参考方向由用户提供的两张图确定,取**混合**:图 1(瑞士/编辑式极简)的排版与
用色克制,图 2(柔和现代 SaaS)的卡片形态与信息承载力。

### 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 风格方向 | 混合:图 1 的排版与克制 + 图 2 的卡片与信息密度 |
| 衬线字 | UI 全部去衬线;**只有 `.reading-prose` 长文阅读保留衬线** |
| 法语内容(TCF 题干/transcript、词汇例句)| **一并去衬线**——它们是短句,不是沉浸阅读 |
| 主色 | 主操作改中性黑;法式蓝 `#3b5ba9` 降为状态色(链接、TCF 等级色阶)|
| 侧栏选中态 | **中性**(白卡 + 黑字 + 阴影),不用蓝——避免一进页面最显眼处就破坏「颜色只出现在有信息量的地方」|
| 实施路径 | 方案 A:token 优先 + 两阶段,阶段 1 只动 8 个文件 |

### 为什么现在的界面读作「复古」

三个来源,按影响排序:

1. **暖色调**:页底 `#faf8f4`、边框 `#e7e1d5`、语义色偏土(warning `#d4922d`、
   danger `#c0492f`)。暖灰是复古感的最大载体。
2. **UI 衬线**:`font-serif` 有 119 处、散在 59 个文件,全部是 UI 用途
   (页标题、卡片标题、大数字、词条、题干)。
3. **圆角无规则**:`rounded-lg` 70 / `rounded-xl` 47 / `rounded-2xl` 44 /
   `rounded-full` 44 / `rounded-md` 10,五档混用,读起来是「攒的」而不是「设计的」。

## 2. 关键机制:用 token 重定向替代 119 处逐文件改

这是本方案成本低的原因,也是最需要说清楚的一点。

**颜色**:全站只有 `src/components/ui/dialog.tsx` 一行绕过了语义 token。
所以换配色 = 只改 `globals.css`,19 个页面自动跟着变。

**衬线**:长文阅读只走 `.reading-prose`(7 处 `<article>`),而该类自己声明
`font-family: var(--font-serif)`。因此:

```
新增 --font-reading  → 指向 Source Serif,只给 .reading-prose 用
把  --font-serif     → 重新指向无衬线栈
```

改 2 行,119 处 UI 衬线全部消失,长文阅读原样保留。

**圆角**:Tailwind v4.2.4 的 radius 走 `--radius-*` 主题变量
(`node_modules/tailwindcss/theme.css:397-404`)。在 `@theme` 中重定义即可全站
收敛,不必改 226 处 `rounded-*` 类名。

> **实现时需验证**:项目现有的是 `@theme inline` 块。`inline` 修饰符改变变量
> 解析方式,radius 这类字面值应放在**新增的普通 `@theme` 块**中。实施第一步就
> 验证 `rounded-2xl` 是否真的变成 20px,不通过则退回逐处改。

### 承认的语义债

token 重定向之后,`font-serif` 这个类名会名不副实——写着 serif,渲染出无衬线。
**这是阶段 1 刻意接受的债,阶段 2 必须还**:把 119 处 `font-serif` 按用途改名
(UI 标题 → 删除该类并交给新的标题样式;确需强调的 → `font-display`)。

阶段 1 不提前还这笔债,是为了让「风格对不对」这个最贵的不确定性,只用 8 个
可回滚的文件就能验证。

## 3. Token 取值

所有色值已通过 WCAG 对比度校验(脚本见「6. 验证」),**16 项全部达标**。

### 中性 / 表面

| Token | 现在 | 新 | 说明 |
|---|---|---|---|
| `--background` | `#faf8f4` 暖米 | `#f4f4f5` | 冷浅灰页底 |
| `--surface` | `#ffffff` | `#ffffff` | 卡片纯白,不变 |
| `--surface-muted` | `#f3efe7` | `#ededf0` | 次级面板、灰 chip |
| `--border` | `#e7e1d5` | `#e4e4e7` | 用量大幅减少(卡片去边框)|
| `--foreground` | `#1c1917` 暖黑 | `#09090b` | 冷近黑 |
| `--muted-foreground` | `#78716c` | `#68686f` | 需同时压过白/页底/灰 chip 三种底,故比样张的 `#71717a` 深一档 |
| `--subtle-foreground` | `#a8a29e` | `#8a8a92` | 装饰级(≥3:1)|

**规则**:`--subtle-foreground` 只达装饰级对比度。**小于 12px 的文字一律不用它**,
改用 `--muted-foreground`。现有的 `text-[11px]` eyebrow 标签需按此调整。

### 主操作(新增)

| Token | 值 | 用途 |
|---|---|---|
| `--primary` | `#09090b` | 主按钮、CTA 实心底 |
| `--primary-foreground` | `#ffffff` | 其上文字 |

`Button` 的 `default` variant 从 `bg-accent` 改为 `bg-primary`。

### 强调色(降级为状态色)

| Token | 现在 | 新 |
|---|---|---|
| `--accent` | `#3b5ba9` | `#3b5ba9` **不变** |
| `--accent-soft` | `#eef1f9` | `#eef2fb` 去暖 |
| `--accent-soft-strong` | `#dde4f3` | `#dfe6f7` 去暖 |

保留 accent 色相不变的收益:`--level-a1` → `--level-c2` 这套 TCF 等级色阶以
`#3b5ba9` 为 B2 锚点,**整套无需重建**。

蓝色改版后只出现在三处:文字链接、TCF 等级徽章、表单聚焦环。

### 语义色(去暖土色)

| Token | 现在 | 新 | 对比度 |
|---|---|---|---|
| `--success` / `--success-soft` | `#2f8f5b` / `#e6f3ec` | `#15803d` / `#ecfdf3` | 4.76 |
| `--warning` / `--warning-soft` | `#d4922d` / `#fbf1de` | `#b45309` / `#fef6ec` | 4.69 |
| `--danger` / `--danger-soft` | `#c0492f` / `#f7e7e1` | `#c81e1e` / `#fef2f2` | 5.24 |

### 不动的两组

- **`--hl-*`**(6 个错误类型高亮色):它们是 Tailwind pastel 色板,本身中性偏冷,
  在新白底上依然成立。且承载分类信息,改动风险高于收益。
- **`--level-*`**(12 个 TCF 等级色/墨色):accent 未变,整套保持一致。

### 字体

| Token | 现在 | 新 |
|---|---|---|
| `--font-sans` | Inter | Inter **不变** |
| `--font-serif` | `var(--font-source-serif), Georgia, ...` | **重新指向 sans 栈**:`var(--font-inter), ui-sans-serif, system-ui, sans-serif` |
| `--font-reading` | — | **新增**:`var(--font-source-serif), Georgia, "Times New Roman", serif`,只给 `.reading-prose` |
| `--font-mono` | Source Code Pro | 不变 |

`--font-reading` 完全定义在 `globals.css` 里(复用已挂载的 `--font-source-serif`
变量),**`layout.tsx` 的字体挂载不需要改**。唯一可做的是把 Source Serif 的字重从
`["400","500","600","700"]` 收窄到 `["400","600"]` —— UI 不再用它,省一点字体体积。
这属于可选优化,不做也不影响。

### 排版尺度(图 1 的味道来源)

| 用途 | 现在 | 新 |
|---|---|---|
| 页标题 | 衬线 36px / 600 / tracking -0.02em | 无衬线 38px / **700** / **tracking -0.035em** |
| 卡片标题 | 衬线 20px / 600 | 无衬线 15px / 600 / tracking -0.015em |
| 大数字(StatCards)| 衬线 34px / 600 | 无衬线 38px / 700 / tracking -0.035em / **tabular-nums** |
| eyebrow 小标签 | 11px subtle | 11px / 600 / tracking 0.13em / **muted**(见对比度规则)|

### 圆角(收敛)

| Tailwind 类 | 默认值 | 新值 | 用量 |
|---|---|---|---|
| `rounded-md` | 6px | 8px | 10 |
| `rounded-lg` | 8px | **10px** | 70(按钮、输入、小面板)|
| `rounded-xl` | 12px | **14px** | 47(次级卡片)|
| `rounded-2xl` | 16px | **20px** | 44(主卡片)|
| `rounded-3xl` | 24px | 24px | 0 |
| `rounded-full` | — | 不变 | 44(chip、头像)|

### 阴影与边框

卡片**去边框**,靠「纯白卡 / 浅灰底」的层次分离(图 2 做法),配极淡阴影:

```
0 1px 2px rgba(9,9,11,.05), 0 1px 3px rgba(9,9,11,.03)
```

`Card` primitive 的 `border border-border/70` 移除。全站 25 处 `shadow-*`
在阶段 2 统一到这一个值或去掉。

## 4. 阶段划分

### 阶段 1 —— 8 个文件,全站生效,可整体回滚

| 文件 | 改动 |
|---|---|
| `src/app/globals.css` | 全部 token;新增 `@theme` radius 块;`.reading-prose` 改用 `--font-reading` |
| `src/app/layout.tsx` | 仅 Source Serif 字重收窄(可选,跳过不影响)|
| `src/components/ui/button.tsx` | `default` variant → `bg-primary`;圆角 `rounded-lg` |
| `src/components/ui/card.tsx` | 去边框 + 新阴影;`CardTitle` 去 `font-serif`,改无衬线收紧 |
| `src/components/ui/chip.tsx` | 去 `ring`,改实心柔和底 |
| `src/components/ui/input.tsx` | 圆角、边框、聚焦环对齐 |
| `src/components/ui/dialog.tsx` | 修掉唯一一处绕过 token 的硬编码色;去 `font-serif` |
| `src/components/sidebar.tsx` | Logo 去衬线收紧;选中态改中性白卡 + 阴影 |

**验收**:`npx tsc --noEmit && npm run lint` 通过,且在浏览器逐页走一遍
Today / Progress / TCF drill / 文档阅读器 / Vocabulary,截图给用户确认。
特别确认阅读页仍是衬线。

### 阶段 2 —— 确认后铺开

1. 还语义债:119 处 `font-serif` 按用途改名或删除。
2. 逐页调间距与层级(`px-10 py-10` 之类的页面容器、卡片内 padding)。
3. 25 处 `shadow-*` 收敛到统一值。
4. eyebrow 类小字从 `subtle-foreground` 换到 `muted-foreground`。

阶段 2 按页推进,每页独立可验证。

## 5. 非目标

- **不做暗色模式**。现在没有,本次不引入(YAGNI)。新 token 结构不妨碍以后加。
- **不改任何布局结构和信息架构**。侧栏分组、页面组成、路由都不动。
- **不动 `--hl-*` 和 `--level-*`**(理由见 3)。
- **不做响应式重构**。现有 `hidden md:flex` 侧栏等断点行为保持原样。

## 6. 验证

- **对比度**:16 组前景/背景组合脚本校验,全部达标。首轮取值有 5 项不达标
  (`muted-foreground` 在页底 4.40、`subtle-foreground` 2.56、danger 4.41 等),
  已据此把 `--muted-foreground` 调深到 `#68686f`、`--subtle-foreground` 调到
  `#8a8a92`、`--danger` 调到 `#c81e1e`。**其中 2 项是现状既有的问题,顺手修掉。**
- **无测试套件**,故验收靠:`npx tsc --noEmit && npm run lint` + 浏览器逐页
  实走 + 截图。
- **回滚**:阶段 1 全部改动落在 8 个文件,`git checkout` 即可整体撤回。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| `@theme` 重定义 radius 在 v4.2.4 不按预期生效 | 实施第一步就单独验证;不通过则退回逐处改类名(226 处,成本高但可行)|
| 去掉卡片边框后,白卡在浅灰底上层次不足 | 阴影值可调;必要时把 `--background` 加深到 `#f1f1f3` |
| `font-serif` 类名说谎期间产生困惑 | 阶段 1 与阶段 2 之间不长期停留;globals.css 中就近写注释标注 |
| 法语短句去衬线后辨识度下降 | 用户已确认接受;若实走后觉得不对,单独给 TCF 题干加回 `--font-reading` 即可 |
