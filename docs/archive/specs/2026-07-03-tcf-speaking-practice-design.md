# TCF Canada 口语练习 — 设计文档

日期：2026-07-03
状态：已与用户确认核心决策，待审阅

## 1. 概述

为 Lumière 增加 TCF Canada 口语（Expression orale）练习功能。TCF 口语共三个任务：

- **Tâche 1** — 自我介绍式问答（无准备，约 2 分钟），考官提问个人情况
- **Tâche 2** — 角色扮演互动（2 分钟准备），**考生**向考官提问（如租房、报名课程）
- **Tâche 3** — 观点表达（无准备，约 4.5 分钟），就一个话题发表看法

功能提供两个练习入口：

1. **脚本准备模式**：选题 → AI 结合个人档案生成参考 script → 对照 script 朗读 → Azure 逐句发音评分
2. **模拟对话模式**：AI 扮演考官，回合制按键说话来回对话 → 结束后生成完整报告

## 2. 已确认的核心决策

| 决策点 | 结论 |
|---|---|
| 对话形态 | 回合制按键说话（非实时语音），架构保留升级实时的空间 |
| 发音评分 | Azure Speech 发音评估（音素/单词级）；GPT 只做内容、语法、词汇反馈 |
| 语音转写 | 由 Azure 发音评估接口顺带返回，**不用 Whisper** |
| 考官语音 | Azure TTS 加拿大法语音色（`fr-CA-SylvieNeural` / `fr-CA-ThierryNeural`） |
| 个人档案 | settings 页自由文本框，存 `user_settings` 表（key = `speaking_profile`） |
| 题库 | 用户整理为纯文本/JSON，写导入脚本（仿 `import-tcf-reading.ts`） |
| 反馈时机 | 对话中仅显示转写 + 发音小分；结束后出完整报告 |
| 错误档案 | 口语语法/词汇错误按 `ERROR_TAXONOMY` 分类写入 `errors` 表（Phase 2） |
| 分阶段 | Phase 1 脚本模式先行打通语音管线；Phase 2 模拟对话 + 报告 + errors 接入 |

## 3. 架构总览

```
浏览器                        服务端                          外部服务
──────                       ──────                         ──────
录音（16kHz PCM WAV）  ──►  POST /api/speaking/assess  ──►  Azure Speech
                             (route handler)                 ├─ 发音评分（音素级）
                                                             └─ 语音转写 STT
考官语音播放          ◄──   GET /api/speaking/tts      ──►  Azure TTS

                             server actions             ──►  OpenAI
                             ├─ generateScript               ├─ script 生成
                             ├─ examinerTurn                 ├─ 考官对话回应
                             └─ finishSession                └─ 内容/语法反馈报告
```

要点：

1. **语音上行只依赖 Azure。** 脚本模式传参考文本做对照评分（scripted assessment）；对话模式用无脚本评分（unscripted assessment），同一次调用返回转写文本 + 发音分。
2. **音频上传走 route handler**（`src/app/api/speaking/assess/route.ts`）而非 server action——server action 默认 1MB body 上限，录音会超。这是项目第一个 API route，属于合理例外，其余读写仍走 server actions。
3. **录音格式**：MediaRecorder 默认输出 webm/opus，Azure 需要 16kHz PCM WAV。采用**浏览器端直接采集 WAV**（AudioContext/AudioWorklet 采 16kHz 单声道 PCM，前端封 WAV 头），避免服务端引入 ffmpeg 依赖。
4. 录音文件保存到 `public/media/speaking/<sessionId>/<turnOrder>.wav`，与现有 TCF 音频资产 (`/media/tcf/`) 同模式。

### 环境变量（新增）

```
AZURE_SPEECH_KEY      # Azure Speech 资源密钥
AZURE_SPEECH_REGION   # 如 canadacentral
```

### 成本估算

一次完整模拟（约 12 分钟，用户说 ~7 分钟）：Azure 发音评估在免费层 5 小时/月内为 $0（超出 $1/小时）；Azure TTS 免费层 50 万字符/月；OpenAI 考官回应 + 报告约 $0.02。**日常使用约 $0–3/月。**

## 4. 数据模型

新增 4 张表（`src/lib/db/schema.ts`）。**不复用 `tcf_questions`**——它是选择题结构，口语题形态完全不同。

```
speaking_prompts                 题库
├─ id            uuid PK
├─ task          integer 1|2|3（tâche 编号）
├─ prompt        text — 题目正文（问题 / 场景卡 / 观点话题）
├─ context       text? — 补充背景（主要给 Tâche 2 场景，说明考官扮演的角色）
├─ source        text? — 来源标注（哪套真题）
└─ createdAt     timestamp

speaking_scripts                 生成的参考脚本
├─ id            uuid PK
├─ promptId      → speaking_prompts (cascade)
├─ content       text — AI 生成的 script，用户可编辑后保存
├─ profileSnapshot  text — 生成时使用的个人档案快照
└─ createdAt     timestamp

speaking_sessions                练习会话
├─ id            uuid PK
├─ promptId      → speaking_prompts (cascade)
├─ mode          enum: script_practice | simulation
├─ status        enum: active | completed | abandoned
├─ report        jsonb? — 结束报告（发音汇总 + GPT 内容反馈），完成时写入
├─ scores        jsonb? — { accuracy, fluency, completeness, overall }
├─ startedAt / completedAt   timestamp
└─ （无用户列——单用户应用）

speaking_turns                   回合记录（两种模式共用；朗读模式 = 每句一条）
├─ id            uuid PK
├─ sessionId     → speaking_sessions (cascade)
├─ order         integer — 回合序号
├─ role          enum: examiner | user
├─ text          text — 考官台词 或 用户语音转写
├─ audioPath     text? — 用户录音相对路径
├─ assessment    jsonb? — Azure 返回的单词级评分明细（user 回合才有）
└─ createdAt     timestamp
```

### 个人档案

`user_settings` 表已存在（key/value）。新增 key `speaking_profile`，值为自由文本（中文或法语均可：职业、城市、家庭、移民目标、兴趣、常用素材故事）。settings 页加一个「口语档案」textarea 卡片，跟随现有 `cefr-level-picker` 组件模式。

### errors 表扩展（Phase 2）

- `submissionId` 放宽为 nullable
- 新增 nullable `speakingSessionId` → `speaking_sessions`（cascade）
- CHECK 约束：两者恰有其一非空
- 口语报告中的语法/词汇错误按 `ERROR_TAXONOMY` 分类入库，`spanStart/spanEnd` 定位于该回合转写文本，与写作错误汇入同一学习者画像

## 5. 页面与交互流程

侧边栏「输出练习」分组下新增「口语 Expression orale」，路由 `/speaking`。

### 5.1 题库页 `/speaking`

- 按 Tâche 1/2/3 分组（tab 或分区列表）
- 每题显示：题目摘要、练习次数、最近/最高发音分
- 点进题目 → 详情页，两个入口按钮：「生成 Script」「开始模拟」

### 5.2 脚本准备模式 `/speaking/[promptId]/script`

1. 首次进入显示「生成 Script」按钮，点击调 `generateScript`：题目 + 个人档案 → GPT 生成符合该 tâche 形态的参考 script（Tâche 2 生成的是「你要问考官的问题清单 + 开场白」）
2. 左栏：script 展示，可重新生成、可手动编辑保存（存 `speaking_scripts`）
3. 右栏：朗读练习——script 自动分句，逐句「录音 → 评分」：
   - 单词级着色（绿=准确，黄=一般，红=发错），点击单词看音素明细
   - 每句显示准确度/流利度分，可无限次重录，取最近一次
   - 整篇读完显示汇总分（存 `speaking_sessions` + `speaking_turns`）

### 5.3 模拟对话模式 `/speaking/[promptId]/simulate`（Phase 2）

1. 开场：Tâche 2 先给 2 分钟准备倒计时（可跳过），Tâche 1/3 直接开始
2. 聊天式界面：
   - 考官气泡：文字 + TTS 音频自动播放（可重播）
   - 用户回合：按住说话（或点击开始/停止）→ 上传评分 → 气泡显示转写 + 发音小分徽章（不展开细节）
   - 考官回应由 `examinerTurn` 生成：prompt 含题目、tâche 规则、对话历史、个人档案；Tâche 2 中 AI 扮演被提问方
3. 回合数达到该 tâche 典型长度或用户点「结束」→ `finishSession`

### 5.4 结束报告 `/speaking/session/[sessionId]/report`

- 总分卡：发音准确度 / 流利度 / 完整度 / 内容
- 逐回合发音详情（复用朗读模式的单词着色组件）
- GPT 内容反馈：语法/词汇错误列表（按 `ERROR_TAXONOMY` 分类，复用写作反馈的 `error-card` 视觉模式）、结构与内容建议、更地道的表达替换
- Phase 2：错误写入 `errors` 表

## 6. 服务层

### Route handlers（新增，音频专用）

- `POST /api/speaking/assess` — multipart：音频 WAV + `referenceText?`（脚本模式传，对话模式不传）→ 调 Azure Speech SDK（服务端）→ 返回 `{ transcript, scores, words[] }`，同时落盘音频、写 `speaking_turns`
- `GET /api/speaking/tts?text=...` — Azure TTS 合成考官语音，流式返回 audio；同一台词缓存到磁盘避免重复合成

### Server actions（`src/lib/actions/speaking.ts`）

- `generateScript(promptId)` — 读题目 + `speaking_profile` → OpenAI → 存 `speaking_scripts`
- `startSession(promptId, mode)` / `abandonSession(sessionId)`
- `examinerTurn(sessionId)` — 对话历史 → OpenAI → 考官下一句（存 turn）
- `finishSession(sessionId)` — 汇总各回合 assessment + 全部转写 → OpenAI 生成报告 → 存 `report`/`scores`（Phase 2 同时写 `errors`）

模型沿用现有环境变量模式：新增 `OPENAI_MODEL_SPEAKING`（默认 `gpt-4o`），script 生成与考官回应可用 `gpt-4o-mini` 起步观察质量。

## 7. 题库导入

格式（用户按此整理，放 `data/tcf-speaking.json`）：

```json
[
  {
    "task": 2,
    "prompt": "Vous voulez vous inscrire à un cours de natation. Vous posez des questions à l'employé de la piscine.",
    "context": "L'examinateur joue l'employé de la piscine.",
    "source": "test 12"
  }
]
```

导入脚本 `scripts/import-tcf-speaking.ts`：读 JSON → upsert `speaking_prompts`（以 task+prompt 去重，幂等可重跑），模式仿照 `import-tcf-reading.ts`。

## 8. 分阶段范围

### Phase 1 — 脚本模式（打通全部语音管线）

- schema 4 张表 + 迁移
- 题库导入脚本 + 题库页
- settings 口语档案
- script 生成 + 编辑保存
- 浏览器 WAV 录音组件 + `/api/speaking/assess`（scripted）+ 逐句评分 UI
- 单词级着色评分组件

### Phase 2 — 模拟对话 + 报告

- `/api/speaking/tts` + 考官语音
- 模拟对话页（回合制、Tâche 2 准备倒计时）
- `examinerTurn` / `finishSession` + 报告页
- unscripted assessment
- `errors` 表扩展 + 口语错误入库

### 明确不做（YAGNI）

- 实时语音通话（保留升级空间：turn 数据结构与评分管线不依赖回合制假设）
- 多用户 / 鉴权
- 口语错误的 SRS 复习卡片（等 errors 数据积累后再说）
- 完整三 tâche 连续计时模拟考（先做单题练习，需要时只是流程编排）

## 9. 边界与错误处理

- **麦克风权限被拒**：录音按钮显示引导文案，不进入录音态
- **Azure 调用失败/超额**：该回合降级为「转写不可用」，保留音频文件可事后重评；UI 明确提示而非静默吞掉
- **录音过短/静音**：Azure 返回低完整度时前端提示重录
- **TTS 失败**：考官气泡仍显示文字，音频缺失不阻断对话
- **会话中断**（关页面）：session 停留 `active`，题库页可见「继续」入口；超过一定时长标 `abandoned`
- **移动端**：AudioWorklet 采样在 iOS Safari 有已知坑，Phase 1 以桌面 Chrome 为准，移动端属加分项

## 10. 验证方式

无测试套件（项目现状）。每阶段人工验证清单：

- Phase 1：导入题库 → 生成 script（检查个人档案被引用）→ 朗读一句故意发错的音 → 确认单词级评分标红 → 刷新后历史分数保留
- Phase 2：完整跑一次 Tâche 2 模拟（AI 扮演被提问方是否守角色）→ 报告页错误分类是否落 `ERROR_TAXONOMY` 合法叶子 → `errors` 表出现口语来源记录
