# TCF 单题讲解写入端点

日期：2026-08-18
状态：设计已确认，待实施

> **2026-08-25 修订（解耦 french-wiki / sundew）：** 本文档描述的"文件是真源、
> 数据库是投影"已被推翻。讲解现在**只存在数据库里**，`POST /api/tcf/explanations`
> 是唯一写入通路；`scripts/sync-tcf-explanations.ts`、`npm run tcf:explain-sync`
> 与环境变量 `TCF_EXPLANATIONS_DIR` 均已删除，lumiere 不再读写 french-wiki 仓库
> 里的任何目录。反向的 `npm run tcf:explain-export` 把库里讲解导成 markdown 存进
> gitignore 的 `data/tcf-explanations/`，那是**备份**，恢复靠重新 POST。
> 下文凡涉及文件真源、双写、sundew 的段落均按此理解。

## 背景

TCF 题库共 3159 道题（listening 42 套、reading 39 套，每套 order_index 1–39），
但 `tcf_questions.explanation` 目前**只有 1 行有内容**。UI 侧的展示链路是通的
（`drill-runner.tsx` 与 `exam-runner.tsx` 在揭晓答案后渲染 `ExplanationPanel`），
缺的是内容写入通路。

现有唯一写入路径是 `npm run tcf:explain-sync`：扫描 `TCF_EXPLANATIONS_DIR` 下的
`.md` 文件批量投影到数据库。它适合"重新导入某套试卷后批量恢复"，但不适合日常
逐题产出——讲解是在另一个仓库（french wiki）的 Claude Code 会话里一道一道写的。

## 目标

让 french wiki 会话写完一道题的讲解后，用一条命令把它送进 lumiere 数据库，
用户刷新页面即可看到。

## 非目标

- 不替代 `tcf:explain-sync`。文件仍是 source of truth，数据库是投影。
  重新导入某套试卷会 delete+insert 从而擦掉 `explanation` 列，批量恢复仍走该脚本。
- 不做鉴权体系。这是单用户本地应用。
- 不改 TCF 前端展示逻辑——它本来就是对的。

## 为什么不用其它方案

- **让那个会话直接连数据库**：需要把 `DATABASE_URL` 带进另一个仓库的会话上下文，
  且依赖 lumiere 的 `node_modules`，跨仓库耦合过重。
- **网站上加粘贴框**：需要人工搬运文本，不符合"它写好、我刷新就看到"的期望。
  （可作为后续增强，不在本次范围。）

HTTP 端点把两个仓库之间的耦合压到最小：只有一个 HTTP 约定，没有共享凭据。

## 端点契约

```
POST /api/tcf/explanations
```

请求体是**原始 markdown**，不是 JSON。讲解含多行、表格、引号、反引号，
JSON 转义易出错；raw body 可原样传输：

```bash
curl -X POST localhost:3000/api/tcf/explanations --data-binary @CE-T1-Q5.md
```

```bash
curl -X POST "localhost:3000/api/tcf/explanations?test=1&skill=listening&q=3" \
  --data-binary @- <<'EOF'
## 全文翻译
…
EOF
```

成功响应 200：

```json
{ "ok": true, "locator": "CE-T1-Q5", "questionId": "…", "hasTranslation": true }
```

回显 locator 是为了让调用方确认究竟写中了哪道题。

## 定位解析

优先级：

1. body 里有 frontmatter → 用 frontmatter
2. 没有 frontmatter → 用 URL 查询参数 `?test=&skill=&q=`
3. 两者都有但**不一致** → 400 `locator_conflict`，拒绝猜
4. 两者都没有 → 400 `locator_missing`

定位三元组 `(test_number, skill, order_index)` join `tcf_sets` 唯一确定一行。
`skill` 只接受字面的 `reading` / `listening`。

## 解析器改动

`src/lib/tcf/parse-explanation.ts` 当前的 `parseExplanationFile()` 在缺 frontmatter
时抛错，撑不起 URL 参数路径。拆成两层：

- `parseExplanationBody(raw)` — frontmatter 可选，返回
  `{ locator: {test, skill, question} | null, body, translationEn }`
- `parseExplanationFile(raw)` — 薄包装，locator 为 null 时抛出原有错误

sync 脚本行为与 `parse-explanation.test.ts` 现有断言均不变，
frontmatter 解析与 `## 全文翻译` 段落抽取逻辑仍只有一份。

报错顺序契约：frontmatter 的问题一律先于正文问题报告（skill / test / question
任一非法或缺失，都优先于「正文为空」）。重构前 skill 校验在前、而 test/question
是在 return 字面量里读取因而排在正文检查之后——那是表达式书写位置的副产品，
不是设计意图，故不予保留。`parseExplanationFile("")` 报「正文为空」是此契约的
自然结果。

## 错误码

沿用 `app/api/speaking/assess/route.ts` 的 `Response.json({ error }, { status })` 风格。

| 状况 | 状态码 | error |
|---|---|---|
| 生产环境 | 404 | —（路由不存在） |
| 带 `Origin` 头（浏览器跨站请求） | 403 | `cross_origin_forbidden` |
| 空请求体 | 400 | `empty_body` |
| 超过 256KB | 413 | `body_too_large` |
| frontmatter 字段非法 | 400 | `invalid_format`（附解析器原始消息） |
| 定位信息缺失 | 400 | `locator_missing` |
| frontmatter 与 URL 参数冲突 | 400 | `locator_conflict` |
| URL 参数不完整或非法 | 400 | `invalid_query` |
| 查无此题 | 404 | `question_not_found` |
| 命中多行 | 409 | `ambiguous_locator` |

## 安全边界

- 仅开发环境启用，`NODE_ENV === "production"` 时返回 404
- `npm run dev` 显式绑定 127.0.0.1（`next dev -H 127.0.0.1`）。Next 的默认 hostname 是
  `0.0.0.0`，会把这个无鉴权端点暴露给整个局域网——早先版本的本文档误称"默认只绑
  localhost"，那是错的
- 拒绝任何带 `Origin` 头的请求（403 `cross_origin_forbidden`）。路由处理器不享受
  Server Actions 的 CSRF 保护，而 `text/plain` body 属 CORS 简单请求、不触发预检，
  用户访问的任意网页都能发起写入；curl 不发 `Origin`，预期调用方不受影响
- 写入范围被限制在"已存在题目的 `explanation` + `translation_en` 两列"：
  不能插入新行，不能触碰其它表

## 幂等性

同一 locator 重复 POST 即覆盖，可反复修订。

## 缓存

drill 页 `await searchParams`，属动态渲染，每次请求重查数据库。
硬刷新即可见，**不需要 `revalidatePath`**。

## 生成端 Prompt 约定

生成讲解的 Prompt 必须在讲解完成后额外输出一份「入库版」：

1. 开头是 frontmatter（`test` / `skill` / `question`）；`question` 是该套试卷内
   的序号 1–39，不是全局题号
2. 英文翻译放在标题**文字恰好为 `全文翻译`** 的段落下（几级标题皆可），
   否则 `translation_en` 会是 null
3. 删除全部对话式口头禅（如「说 next。」），否则会原样渲染到页面上
4. 整篇直接输出，**不要包在 ``` 代码围栏里**——首行不是 `---` 会导致
   frontmatter 检测失败

## 测试

与 `parse-explanation.test.ts` 同风格（`node:test`，`npx tsx --test` 手动跑）。

- `parseExplanationBody()`：有/无 frontmatter、`全文翻译` 段落有无
- `parseExplanationFile()`：确认既有行为未变
- locator 归并纯函数：frontmatter 优先、URL 兜底、冲突检测

DB 交互与生产环境拒绝由手动验证覆盖（项目无集成测试设施）。

## 验证

`npx tsc --noEmit && npm run lint`，外加真实 POST 一道题后在页面上确认渲染。
