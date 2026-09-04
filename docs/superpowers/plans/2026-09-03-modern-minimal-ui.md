# 现代极简 UI 改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Lumière 从「暖米底 + 衬线 + 法式蓝主色」改成「冷中性浅灰底 + 纯白无边框卡片 + 无衬线收紧排版 + 黑色主操作」,阶段 1 只动 8 个文件即让全站生效。

**Architecture:** 不逐文件改视觉类名,而是改 token:颜色全走 `globals.css`(全站仅 1 处绕过 token);`--font-serif` 重新指向 sans 栈、`.reading-prose` 改用新的 `--font-reading`,让 119 处 UI 衬线一次性翻转而长文阅读不受影响;圆角靠 Tailwind v4 的 `@theme --radius-*` 覆盖收敛,不动 226 处 `rounded-*` 类名。阶段 2 再偿还「`font-serif` 类名说谎」这笔刻意接受的语义债。

**Tech Stack:** Next.js 16.2.4(App Router)、Tailwind CSS 4.2.4、React、`cva` + `cn`、Radix UI(dialog)、lucide-react、next/font(Inter / Source Serif 4 / Source Code Pro)。

**Spec:** `docs/superpowers/specs/2026-09-03-modern-minimal-ui-design.md`

## Global Constraints

以下约束对**每一个** task 都生效:

- **没有测试套件。** 验证 = `npx tsc --noEmit && npm run lint` 通过 **+** 浏览器实走改动页面。前者通过**不等于**功能正确,不得据此宣称完成。
- **git commit 不带任何 `Co-Authored-By: Claude` 或 `Generated with Claude Code` 尾注。** 只写 conventional commit 正文。
- **不做暗色模式。** 不引入 `@media (prefers-color-scheme)` 或 `data-theme`。
- **不动 `--hl-*`(6 个错误高亮色)和 `--level-*`(12 个 TCF 等级色/墨色)。** 它们承载分类信息,且 `--accent` 色相未变,整套保持一致。
- **不改布局结构、信息架构、路由、响应式断点。** 侧栏分组、`hidden md:flex` 等行为原样保留。
- **`--subtle-foreground` 只达装饰级对比度(≥3:1)。小于 12px 的文字一律不得使用它**,改用 `--muted-foreground`。
- **色值一律照抄本计划给出的十六进制值**,它们经过 WCAG 校验(16 组全达标),不得凭感觉微调。
- 开发服务器通常已在 `:3000` 运行(用户自己开着)。**先检查已有服务器,不要另起一个。**

---

### Task 1: 验证 `@theme` 能覆盖 Tailwind 的圆角尺度

这是整个方案的**风险闸门**。若覆盖不生效,阶段 1 的「圆角收敛」就得退回逐处改 226 个类名,后续任务的范围随之改变。所以先用最小改动验证,再做别的。

**Files:**
- Modify: `src/app/globals.css`(在 `@theme inline` 块之后新增一个普通 `@theme` 块)

**Interfaces:**
- Consumes: 无(首个任务)
- Produces: `globals.css` 中一个普通 `@theme` 块,后续 Task 2 会往里加 `--shadow-card`。Tailwind 工具类 `rounded-md/lg/xl/2xl` 的计算值变为 8/10/14/20px。

- [ ] **Step 1: 记录当前基线**

确认 Tailwind 的默认值(用于对比),运行:

```bash
grep -n -- "--radius-" node_modules/tailwindcss/theme.css | head -10
```

Expected: 看到 `--radius-md: 0.375rem; --radius-lg: 0.5rem; --radius-xl: 0.75rem; --radius-2xl: 1rem;`(即 6/8/12/16px)。

- [ ] **Step 2: 新增 `@theme` 块**

在 `src/app/globals.css` 里,紧跟在现有 `@theme inline { ... }` 闭合花括号**之后**,新增:

```css
/* Radius scale — collapsed from the five-way mix the app grew into.
   Plain @theme (not inline): these are literal values, not var() indirections. */
@theme {
  --radius-md: 0.5rem; /* 8px  — was 6px */
  --radius-lg: 0.625rem; /* 10px — was 8px; buttons, inputs, small panels */
  --radius-xl: 0.875rem; /* 14px — was 12px; secondary cards */
  --radius-2xl: 1.25rem; /* 20px — was 16px; primary cards */
}
```

- [ ] **Step 3: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过(本步只改 CSS,应无影响)。

- [ ] **Step 4: 在浏览器里量真实计算值**

确认 dev server 在跑(用户通常已开着 `:3000`);没有的话用 preview 工具启动,**不要用 Bash 起 dev server**。

打开 `http://localhost:3000/today`,执行:

```js
getComputedStyle(document.querySelector('.rounded-2xl')).borderRadius
```

Expected: `"20px"`。

再验证一档,确认不是巧合:

```js
[...document.querySelectorAll('.rounded-lg')].slice(0,1).map(el => getComputedStyle(el).borderRadius)
```

Expected: `["10px"]`。

- [ ] **Step 5: 闸门判定**

- **量到 20px / 10px** → 覆盖生效,继续 Task 2。
- **仍是 16px / 8px** → 覆盖**未**生效。**停下来向用户报告**,不要自行改方案。退路是逐处改 226 个 `rounded-*` 类名(可行但贵),需要用户重新拍板范围。

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "style(tokens): collapse the radius scale via @theme override"
```

---

### Task 2: 重写 `globals.css` 的全部颜色与字体 token

全站 19 个页面的配色在这一步一次性改变。

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 建立的普通 `@theme` 块
- Produces: 新增语义 token `--primary` / `--primary-foreground`(Tailwind 类:`bg-primary`、`text-primary-foreground`);新增 `--font-reading`(仅 `.reading-prose` 使用,**不进 `@theme`**,故无 `font-reading` 工具类);新增 `shadow-card` 工具类。`--font-serif` 自此指向 sans 栈。

- [ ] **Step 1: 替换 `:root` 中的表面与文字 token**

把 `:root` 里 Surfaces 与 Text 两段替换为:

```css
  /* Surfaces — cool neutral; cards separate from the page by tint, not borders */
  --background: #f4f4f5;
  --surface: #ffffff;
  --surface-muted: #ededf0;
  --border: #e4e4e7;

  /* Text */
  --foreground: #09090b;
  --muted-foreground: #68686f;
  /* Decorative contrast only (~3:1). Anything under 12px must use
     --muted-foreground instead. */
  --subtle-foreground: #8a8a92;
```

- [ ] **Step 2: 新增主操作 token,并把 accent 降级**

把 `:root` 里 Accents 一段替换为:

```css
  /* Primary action — neutral black. Buttons and CTAs live here now. */
  --primary: #09090b;
  --primary-foreground: #ffffff;

  /* Accent — demoted to a status colour: links, TCF level scale, focus rings.
     Hue deliberately unchanged so the --level-a1→c2 scale still anchors on it. */
  --accent: #3b5ba9;
  --accent-foreground: #ffffff;
  --accent-soft: #eef2fb;
  --accent-soft-strong: #dfe6f7;
```

- [ ] **Step 3: 语义色去暖土**

把 `:root` 里 Semantic 一段替换为:

```css
  /* Semantic — de-warmed; the old ochre/rust read as vintage */
  --success: #15803d;
  --success-soft: #ecfdf3;
  --warning: #b45309;
  --warning-soft: #fef6ec;
  --danger: #c81e1e;
  --danger-soft: #fef2f2;
```

**不要改动**其下的 `--hl-*` 和 `--level-*` 两组,原样保留。

- [ ] **Step 4: 新增阅读字体 token**

在 `:root` 末尾(`--level-c2-ink` 之后、闭合花括号之前)加入:

```css
  /* Long-form reading keeps the serif. Defined here rather than in @theme:
     only .reading-prose consumes it, so it needs no utility class. */
  --font-reading: var(--font-source-serif), Georgia, "Times New Roman", serif;
```

- [ ] **Step 5: 在 `@theme inline` 中登记 primary**

在 `@theme inline` 块里,`--color-accent-soft-strong` 那一行之后加入:

```css
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
```

- [ ] **Step 6: 把 `--font-serif` 指向 sans 栈**

在 `@theme inline` 块里,把这一行:

```css
  --font-serif: var(--font-source-serif), Georgia, "Times New Roman", serif;
```

替换为:

```css
  /* DEBT (phase 2): this deliberately points at the sans stack so all 119 UI
     `font-serif` usages flip at once. The class name lies until those are
     renamed/removed — see the phase-2 tasks in
     docs/superpowers/plans/2026-09-03-modern-minimal-ui.md */
  --font-serif: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
```

- [ ] **Step 7: 把卡片阴影加进 `@theme` 块**

在 Task 1 建的 `@theme` 块里,radius 之后加入:

```css

  /* Cards carry no border now; this is the whole of their elevation. */
  --shadow-card: 0 1px 2px rgba(9, 9, 11, 0.05), 0 1px 3px rgba(9, 9, 11, 0.03);
```

- [ ] **Step 8: 让 `.reading-prose` 改用阅读字体**

把 `.reading-prose` 规则里的:

```css
  font-family: var(--font-serif);
```

替换为:

```css
  font-family: var(--font-reading);
```

- [ ] **Step 9(可选): 收窄 Source Serif 的字重**

UI 不再用衬线,只剩 `.reading-prose` 的正文,所以多加载的字重是纯浪费。
`src/app/layout.tsx` 中把:

```tsx
  weight: ["400", "500", "600", "700"],
```

(位于 `Source_Serif_4({ ... })` 内)改为:

```tsx
  weight: ["400", "600"],
```

**这一步跳过不影响任何功能**,只是少下载两个字重。若阅读页出现字重回退(正文变细或加粗位置不对),把它改回去即可。

- [ ] **Step 10: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 11: 浏览器验证——最关键的一步**

打开 `http://localhost:3000/today`,确认:
- 页底是冷浅灰,不再是暖米
- 「Today」大标题**已经是无衬线**(靠 token 重定向,页面代码没动)

再打开任意一篇文档阅读页(`/library` 里点进一篇),执行:

```js
getComputedStyle(document.querySelector('.reading-prose')).fontFamily
```

Expected: 返回值里含 Source Serif,**不含** Inter。这一条证明「UI 去衬线、长文留衬线」的分流成立。若返回 Inter,说明 Step 8 没生效或 `--font-source-serif` 未挂载,**停下排查,不要继续**。

- [ ] **Step 12: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "style(tokens): cool-neutral palette, black primary, sans UI type"
```

---

### Task 3: Card 与 Chip primitive

**Files:**
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/chip.tsx`

**Interfaces:**
- Consumes: Task 2 的 `shadow-card` 工具类、`--surface-muted` / 语义 soft 色
- Produces: `Card` 不再带边框;`CardTitle` 不再带 `font-serif`。两个组件的**导出名与 props 签名完全不变**,调用方无需改动。

- [ ] **Step 1: Card 去边框、换阴影**

`src/components/ui/card.tsx` 中,把:

```tsx
      "rounded-2xl border border-border/70 bg-surface shadow-[0_1px_2px_rgba(28,25,23,0.04)]",
```

替换为:

```tsx
      "rounded-2xl bg-surface shadow-card",
```

- [ ] **Step 2: CardTitle 去衬线、收紧**

同文件中,把 `CardTitle` 的类名:

```tsx
      "font-serif text-xl font-semibold tracking-tight",
```

替换为:

```tsx
      "text-[15px] font-semibold tracking-[-0.015em]",
```

- [ ] **Step 3: Chip 去 ring,改实心柔和底**

`src/components/ui/chip.tsx` 中,把 `variantClasses` 整体替换为:

```tsx
const variantClasses: Record<NonNullable<ChipProps["variant"]>, string> = {
  neutral: "bg-surface-muted text-muted-foreground",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
```

并把同文件里 `Chip` 的基础类名:

```tsx
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
```

替换为:

```tsx
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
```

- [ ] **Step 4: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 5: 浏览器验证**

打开 `http://localhost:3000/progress`(卡片和 chip 最密集的页面),确认:
- 卡片没有边框,白卡靠阴影和浅灰底分离
- chip 没有描边圈,是实心柔和底
- 白卡在浅灰底上层次**够不够**。若明显发飘,记录下来——退路是把 `--background` 从 `#f4f4f5` 加深到 `#f1f1f3`,但**先记录、别自行改**,留到 Task 7 一并判断。

- [ ] **Step 6: 记录 CardTitle 偏小的页面**

`CardTitle` 从 20px 降到 15px 是刻意的,但在少数把它当主标题用的页面上可能偏小。浏览 `/quiz`、`/speaking`、`/settings`,**把觉得偏小的页面记在任务输出里**,留给阶段 2 单独覆盖。本步不改代码。

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/chip.tsx
git commit -m "style(ui): borderless cards, flat chips, sans card titles"
```

---

### Task 4: Button 与 Input primitive

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`

**Interfaces:**
- Consumes: Task 2 的 `bg-primary` / `text-primary-foreground`
- Produces: `Button` 的 `default` variant 变为黑底白字。**variant 与 size 的名字全部不变**(`default` / `outline` / `ghost` / `soft` / `danger` / `link`),调用方无需改动。

- [ ] **Step 1: Button 的 default variant 改黑**

`src/components/ui/button.tsx` 中,把 `variants.variant` 里的 `default` 与 `outline` 两项:

```tsx
        default:
          "bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm",
        outline:
          "border border-border bg-surface text-foreground hover:bg-accent-soft hover:border-accent-soft-strong",
```

替换为:

```tsx
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border border-border bg-surface text-foreground hover:bg-surface-muted",
```

`ghost` / `soft` / `danger` / `link` 四项**保持原样**。

- [ ] **Step 2: Input 与 Textarea 去阴影**

`src/components/ui/input.tsx` 中,`Input` 的:

```tsx
        "flex h-9 w-full rounded-lg border border-border bg-surface px-3 py-1 text-sm shadow-sm transition-colors",
```

替换为:

```tsx
        "flex h-9 w-full rounded-lg border border-border bg-surface px-3 py-1 text-sm transition-colors",
```

同文件 `Textarea` 的:

```tsx
        "flex min-h-[120px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm transition-colors",
```

替换为:

```tsx
        "flex min-h-[120px] w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors",
```

聚焦环(`focus-visible:ring-accent/30`)**保持不变**——蓝色留给聚焦态是 spec 明确保留的三处用途之一。

- [ ] **Step 3: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 4: 浏览器验证**

打开 `http://localhost:3000/practice`,确认:
- 主按钮是黑底白字
- 输入框/文本域没有内阴影,聚焦时仍出现蓝色环
- 用 Tab 键走一遍,确认聚焦环清晰可见(黑按钮上的蓝环不能糊掉)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/input.tsx
git commit -m "style(ui): black primary button, flatten inputs"
```

---

### Task 5: Dialog primitive(含全站唯一一处硬编码色)

**Files:**
- Modify: `src/components/ui/dialog.tsx`

**Interfaces:**
- Consumes: Task 2 的 `--foreground` token
- Produces: 无新导出。修掉全站唯一绕过 token 的硬编码色 `bg-stone-900/30`。

- [ ] **Step 1: 遮罩层改用 token**

`DialogOverlay` 中,把:

```tsx
      "fixed inset-0 z-50 bg-stone-900/30 backdrop-blur-[2px]",
```

替换为:

```tsx
      "fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px]",
```

`bg-stone-900` 是暖色,是全站唯一绕过语义 token 的颜色;换成 `bg-foreground` 后遮罩随主题走。

- [ ] **Step 2: 弹窗去边框**

`DialogContent` 中,把:

```tsx
        "rounded-2xl bg-surface shadow-2xl border border-border/70",
```

替换为:

```tsx
        "rounded-2xl bg-surface shadow-2xl",
```

`shadow-2xl` **保留**——弹窗需要强投影把自己从遮罩上抬起来,这跟卡片的 `shadow-card` 是不同用途。

- [ ] **Step 3: DialogTitle 去衬线**

把:

```tsx
      "font-serif text-xl font-semibold tracking-tight",
```

替换为:

```tsx
      "text-lg font-semibold tracking-[-0.02em]",
```

- [ ] **Step 4: 确认硬编码色已清零**

```bash
grep -rn '\(bg\|text\|border\)-\(white\|black\|gray\|slate\|stone\|zinc\|neutral\|amber\|blue\|red\|green\|emerald\|indigo\|violet\|purple\|pink\|orange\|yellow\)-[0-9]' src --include='*.tsx'
```

Expected: **无输出**。有输出说明还有绕过 token 的颜色,逐个改成语义 token。

- [ ] **Step 5: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 6: 浏览器验证**

打开 `http://localhost:3000/quiz`,点开 import 对话框(或 `/library` 的 add document 对话框),确认遮罩是冷灰、弹窗无边框、标题无衬线。

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "style(ui): token-driven dialog overlay, drop the last hardcoded colour"
```

---

### Task 6: 侧栏

**Files:**
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: Task 2 的 `shadow-card`、`--surface`、`--foreground`
- Produces: 无新导出。`NAV_ITEMS` 数组与 `matcher` 逻辑**完全不动**——本任务只改视觉。

- [ ] **Step 1: 外层去底色去边框**

把 `<aside>` 的类名:

```tsx
    <aside className="hidden md:flex w-[200px] shrink-0 flex-col border-r border-border/60 bg-surface-muted/60 px-3 py-6">
```

替换为:

```tsx
    <aside className="hidden md:flex w-[200px] shrink-0 flex-col px-3 py-6">
```

侧栏自此直接坐在页底浅灰上,选中项作为白卡浮起来——这是层次的来源,所以底色和边框都不再需要。`hidden md:flex` 断点行为不变。

- [ ] **Step 2: Logo 去衬线、收紧**

把 Logo 那段:

```tsx
        <Sparkles className="h-5 w-5 text-accent" strokeWidth={1.8} />
        <span className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Lumière
        </span>
```

替换为:

```tsx
        <Sparkles className="h-[18px] w-[18px] text-foreground" strokeWidth={2} />
        <span className="text-xl font-bold tracking-[-0.04em] text-foreground">
          Lumière
        </span>
```

图标也从蓝改黑——蓝色不再是品牌色。

- [ ] **Step 3: 选中态改中性白卡**

把导航项的条件类名:

```tsx
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
```

替换为:

```tsx
                active
                  ? "bg-surface text-foreground font-semibold shadow-card"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
```

这是 spec 里明确记录的、对「蓝降为状态色」的一处刻意偏离:一进页面最显眼处摆一块蓝,会破坏「颜色只出现在有信息量的地方」。用户已确认。

- [ ] **Step 4: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 5: 浏览器验证**

打开 `http://localhost:3000/today`,确认:
- 侧栏与页面同底色,无分隔边框
- 「Today」项是白卡 + 黑字 + 阴影
- 逐个点击 Library / Vocabulary / TCF / Progress,确认选中态跟着走(`matcher` 逻辑未被破坏)

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "style(sidebar): neutral active state, sans wordmark, borderless"
```

---

### Task 7: 阶段 1 全站实走验收

这是阶段 1 的收口。**没有测试套件,所以这一步就是测试。** 不做完不得宣称阶段 1 完成。

**Files:**
- 不改代码(除非发现回归)
- Modify(仅在需要时): `src/app/globals.css`

**Interfaces:**
- Consumes: Task 1–6 的全部改动
- Produces: 一份逐页验收结论 + 截图,交给用户确认

- [ ] **Step 1: 编译与 lint 全量**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过,零 warning 新增。

- [ ] **Step 2: 逐页实走**

依次打开并**截图**下列页面,每页确认「无衬线 UI + 冷灰底 + 白卡无边框 + 黑主按钮」:

| 页面 | 额外要确认的 |
|---|---|
| `/today` | 侧栏选中态;streak 的橙色不再土黄 |
| `/progress` | 大数字无衬线;分类高亮色 `--hl-*` 未变 |
| `/tcf` | TCF 等级徽章仍是蓝色阶(`--level-*` 未受影响)|
| `/tcf/drill` | 题干、transcript 已去衬线(用户已确认要这样)|
| `/quiz` 的 cloze | 段落用 `.reading-prose`,应仍是衬线 |
| `/library` | 文档列表 |
| `/documents/[任一 id]` | **长文正文仍是衬线** ← 最关键 |
| `/vocabulary` | 词条、例句已去衬线 |
| `/practice` | 黑主按钮、输入框 |
| `/settings` | 表单控件 |

- [ ] **Step 3: 判定法语短句去衬线后是否还读得动**

用户已确认 TCF 题干、transcript、词汇例句一并去衬线。但这是需要**实际读一遍法语**才知道的判断,所以在 `/tcf/drill` 上真正做几道题、在 `/vocabulary` 里翻几个词条。

若确实觉得辨识度下降,spec 里预留的退路是**只给这几处加回阅读字体**——在 `globals.css` 加一个窄用途类:

```css
/* Short French strings that still benefit from the serif's letterform
   distinctions (accents, i/l/1). Not the same thing as .reading-prose. */
.french-inline {
  font-family: var(--font-reading);
}
```

然后只在 TCF 题干和词汇例句上挂 `french-inline`。**先记录判断,不要在本步就改**——这是产品口味问题,交给 Step 5 一并问用户。

- [ ] **Step 4: 判定白卡层次是否足够**

综合 Task 3 Step 5 记录的观察。若多页都觉得白卡在浅灰底上发飘,把 `src/app/globals.css` 的:

```css
  --background: #f4f4f5;
```

改为:

```css
  --background: #f1f1f3;
```

这是 spec 里预留的退路。改完重跑 Step 1、重看 Step 2 里最密集的 `/progress`。**若层次已经足够,不要改。**

- [ ] **Step 5: 把截图交给用户**

用 SendUserFile 把 `/today`、`/progress`、`/documents/[id]` 三张截图发给用户,并明确说明:
- 阶段 1 完成的范围(8 个文件)
- Task 3 Step 6 记录的「CardTitle 偏小」页面清单
- Step 3 关于法语短句可读性的判断
- 是否动用了 Step 4 的底色退路

**等用户确认后再进阶段 2。**

- [ ] **Step 6: Commit(仅当 Step 4 改了底色)**

```bash
git add src/app/globals.css
git commit -m "style(tokens): deepen page tint so white cards keep separation"
```

---

## 阶段 2 —— 偿还语义债与逐页收敛

**进入条件:用户已确认阶段 1 的截图。** 阶段 2 的每个任务都独立可验证、可单独回滚。

---

### Task 8: 页面主标题改用新的展示排版

19 个页面的 H1 现在靠 token 重定向变成了无衬线,但字重和字距还是老的(`font-semibold tracking-tight`),不是 spec 定的 `font-bold tracking-[-0.035em]`。这一步让大标题真正拿到图 1 的排版。

**Files:**
- Modify: 各页面的 H1,逐个处理(用 Step 1 的命令枚举)

**Interfaces:**
- Consumes: 阶段 1 的全部 token
- Produces: 页面 H1 统一为 `text-[38px] font-bold tracking-[-0.035em]`;这些位置的 `font-serif` 类被**删除**(而非保留说谎)

- [ ] **Step 1: 枚举所有页面主标题**

```bash
grep -rn 'font-serif text-\(3xl\|4xl\)' src --include='*.tsx'
```

把输出的每一处都记下来——这些是页面级 H1。

- [ ] **Step 2: 逐处替换**

对每一处,把 `font-serif text-4xl font-semibold tracking-tight` 形态的类名替换为:

```
text-[38px] font-bold tracking-[-0.035em]
```

`text-3xl` 的那些(如文档阅读页的标题)替换为:

```
text-[30px] font-bold tracking-[-0.03em]
```

注意**只删 `font-serif`,不要动同一个 className 里的布局类**(如 `break-words`、`mt-2`)。

- [ ] **Step 3: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 4: 浏览器验证**

打开 `/today`、`/progress`、`/vocabulary`、`/tcf` 与任一文档页,确认大标题更粗、字距更紧,且没有页面标题被误删布局类而错位。

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "style(type): tighten page headings to the display scale"
```

---

### Task 9: 大数字改等宽数字

`StatCards` 之类的统计数字现在是比例数字,数值变化时会左右跳动。

**Files:**
- Modify: `src/app/(main)/progress/_components/stat-cards.tsx`
- Modify: 其它含 `font-serif text-4xl` 统计数字的文件(由 Task 8 Step 1 的枚举结果确定)

**Interfaces:**
- Consumes: 阶段 1 token
- Produces: 统计数字统一为 `text-[38px] font-bold tracking-[-0.035em] tabular-nums`

- [ ] **Step 1: 改 StatCards 的四处数字**

`src/app/(main)/progress/_components/stat-cards.tsx` 中,把每一处:

```tsx
        <p className="font-serif text-4xl font-semibold text-foreground">
```

替换为:

```tsx
        <p className="text-[38px] font-bold tracking-[-0.035em] tabular-nums text-foreground">
```

同文件里 "Not enough data yet" 分支的:

```tsx
            <p className="font-serif text-4xl font-semibold text-muted-foreground">—</p>
```

替换为:

```tsx
            <p className="text-[38px] font-bold tracking-[-0.035em] tabular-nums text-muted-foreground">—</p>
```

- [ ] **Step 2: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 3: 浏览器验证**

打开 `/progress`,确认四个数字对齐、字宽一致。

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "style(progress): tabular numerals for stat figures"
```

---

### Task 10: 清空剩余 `font-serif`,并撤掉说谎的 token

这一步把债还完:删掉所有剩余的 `font-serif` 类,然后把 `--font-serif` 的覆盖从 `globals.css` 里**移除**,让类名不再说谎。

**Files:**
- Modify: 剩余含 `font-serif` 的文件(Task 8、9 之后剩下的)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 8、9 已处理掉页面标题与统计数字
- Produces: 全站 `font-serif` 计数归零;`@theme inline` 中不再有 `--font-serif` 覆盖(回落到 Tailwind 默认 serif 栈,但已无人使用)

- [ ] **Step 1: 看剩下多少**

```bash
grep -rn 'font-serif' src --include='*.tsx' | wc -l
grep -rl 'font-serif' src --include='*.tsx'
```

记录数量与文件清单。

- [ ] **Step 2: 逐文件删除**

剩下的绝大多数是「法语内容」和小标题(TCF 题干、词汇例句、卡片内小标题)。因为 `--font-serif` 已指向 sans,**删掉这个类是零视觉变化**的纯清理。

对每一处:从 className 里删掉 `font-serif` 这一个词,**其余类名一律不动**。

例:`"font-serif text-lg font-semibold"` → `"text-lg font-semibold"`

- [ ] **Step 3: 确认归零**

```bash
grep -rn 'font-serif' src --include='*.tsx'
```

Expected: **无输出**。

- [ ] **Step 4: 撤掉说谎的 token**

从 `src/app/globals.css` 的 `@theme inline` 块里,**整段删除**这条(含 Task 2 Step 6 写的 DEBT 注释):

```css
  /* DEBT (phase 2): ... */
  --font-serif: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
```

`.reading-prose` 用的是 `--font-reading`,不受影响。

- [ ] **Step 5: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 6: 浏览器验证——确认零视觉变化**

这一步的正确结果是**什么都没变**。打开 `/tcf/drill`、`/vocabulary`、`/progress`,与阶段 1 的截图逐一比对,确认字体没有任何回退成衬线的地方。

**特别确认**:打开一篇文档阅读页,`.reading-prose` 正文**仍是衬线**:

```js
getComputedStyle(document.querySelector('.reading-prose')).fontFamily
```

Expected: 含 Source Serif。

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "refactor(style): remove all font-serif usages and the token that faked them"
```

---

### Task 11: 收敛阴影,并修掉小字对比度

**Files:**
- Modify: 含 `shadow-sm` / `shadow-md` / `shadow-lg` 的文件
- Modify: 用 `text-subtle-foreground` 配 11px 字的文件

**Interfaces:**
- Consumes: 阶段 1 的 `shadow-card`
- Produces: 全站阴影收敛到 `shadow-card`(或去掉);11px 小字不再使用 `--subtle-foreground`

- [ ] **Step 1: 枚举阴影**

```bash
grep -rn 'shadow-sm\|shadow-md\|shadow-lg\|shadow-\[' src --include='*.tsx'
```

- [ ] **Step 2: 逐处处理**

- 卡片类容器上的 `shadow-sm` → 改为 `shadow-card`
- 按钮、chip、输入框上的 `shadow-sm` → **删掉**(极简风里这些控件不投影)
- 浮层/弹窗上的 `shadow-lg` / `shadow-xl` / `shadow-2xl` → **保留**(它们需要强投影)

- [ ] **Step 3: 枚举小字用 subtle 色的地方**

```bash
grep -rn 'text-\[11px\]' src --include='*.tsx' | grep 'subtle-foreground'
grep -rn 'text-xs' src --include='*.tsx' | grep 'subtle-foreground'
```

- [ ] **Step 4: 逐处替换**

把这些位置的 `text-subtle-foreground` 换成 `text-muted-foreground`。

依据是 Global Constraints 里那条:`--subtle-foreground` 只有装饰级对比度(在页底 3.12:1),小于 12px 的文字用它读不清。`text-xs` 是 12px,处于边界——**优先改 `text-[11px]` 的**,`text-xs` 的按视觉判断,拿不准就改。

- [ ] **Step 5: 编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 6: 浏览器验证**

打开 `/today`(顶部日期 eyebrow 是 11px)和 `/progress`,确认小标签更清晰可读,且阴影不再深浅不一。

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "style: collapse shadows to one card elevation, fix small-text contrast"
```

---

### Task 12: 逐页间距与层级微调

阶段 2 的收尾。前面几步都是全站机械替换,这一步是**逐页看**。

**Files:**
- Modify: 各页面容器与卡片内 padding,按页处理

**Interfaces:**
- Consumes: Task 8–11
- Produces: 每页一次独立提交,便于单独回滚

- [ ] **Step 1: 处理 Task 3 Step 6 记录的 CardTitle 偏小清单**

对那些把 `CardTitle` 当主标题用的页面,在调用处加 className 覆盖,例如:

```tsx
<CardTitle className="text-lg tracking-[-0.02em]">
```

**不要改 `CardTitle` 的默认值**——默认的 15px 对大多数页面是对的。

- [ ] **Step 2: 逐页走查间距**

按下列顺序逐页打开,检查页面容器 padding(如 `px-10 py-10`)和卡片内 padding 在新圆角/无边框下是否协调:

`/today` → `/progress` → `/library` → `/vocabulary` → `/practice` → `/tcf` → `/quiz` → `/speaking` → `/conjugation` → `/settings`

**每页改完立刻单独提交**,提交信息形如:

```bash
git commit -m "style(today): tune spacing for the borderless card scale"
```

- [ ] **Step 3: 全量编译检查**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 两条都通过。

- [ ] **Step 4: 最终验收并交付**

重跑 Task 7 Step 2 的逐页实走,截图发给用户,说明阶段 2 完成范围。

---

## 完成定义

- [ ] `npx tsc --noEmit && npm run lint` 通过
- [ ] `grep -rn 'font-serif' src --include='*.tsx'` 无输出
- [ ] `grep -rn '\(bg\|text\|border\)-\(white\|black\|gray\|slate\|stone\|zinc\|neutral\|amber\|blue\|red\|green\|emerald\|indigo\|violet\|purple\|pink\|orange\|yellow\)-[0-9]' src --include='*.tsx'` 无输出
- [ ] 文档阅读页 `.reading-prose` 的 `fontFamily` 仍含 Source Serif
- [ ] TCF 等级徽章仍是蓝色阶,错误分类高亮色未变
- [ ] 阶段 1、阶段 2 的截图都已交用户确认
