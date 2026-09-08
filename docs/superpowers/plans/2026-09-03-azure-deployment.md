# Azure 部署上线计划（修订版）

> 2026-09-07 后续方案修订：用户已选择“公开只读演示 + 邀请制账号 + 私人学习数据”。执行前先读 [邀请制用户与安全实施计划](2026-09-07-invite-only-security.md)。该文档取代本文匿名实时 AI、共享访客写入和仅靠外层认证的旧设计；保留适用的双部署隔离、构建、预算与备份约束。本文下方历史任务尚未逐项重写，冲突按新计划第 2 节执行。

修订日期：2026-09-07。状态：**阶段 A 进行中**；本地基线已验证，GitHub CI 实跑、发布 UI 验收和云资源参数仍待确认。生产构建、迁移、云资源与部署尚未验收。

目标：先让本人在任何设备上使用完整题库，再提供招聘者可试用的公开 demo，最后完成自动部署和作品集展示。

## 1. 方案与边界

- 同一份应用代码、同一个经过验证的镜像，部署为 `lumiere-private` 和 `lumiere-demo`。
- 私有版：现有个人数据库、独立运行账号、Azure Files 媒体和录音、Easy Auth + Entra 用户限制。
- demo：独立 `lumiere_demo` 数据库、独立运行账号、自制/明确可公开使用的素材，不挂载私有媒体卷。
- 通过服务端运行时环境变量控制 demo 能力、限流和写入限制。允许必要的模式判断，不再承诺“代码零分支”。不得使用 `NEXT_PUBLIC_` 保存密钥或决定服务端访问权限。
- 两个 database 仍共用一台 PostgreSQL server；这是数据库和权限隔离，不是独立服务器，也不能消除错误配置或管理员权限带来的风险。
- 保留现有模型配置，不为上线默认降级模型。公开 demo 的费用通过覆盖全部付费入口的限流、输入上限、持久配额和紧急开关控制。
- demo 定位为**共享体验环境**，不是多人私密账号系统。首期展示阅读、查词、写作反馈、TCF、自制示例进度；暂不接受真实录音、任意文件和任意外部 URL 导入。
- 录音评估及完整个人学习数据在私有版展示。demo 可以显示自制的只读发音示例，并明确标注。
- 不把访问控制写成版权许可结论。公开素材只采用自制或已确认可公开使用的内容；作品集录屏也使用这些素材，不以“不公开链接”作为内容许可依据。不声称未核验的素材已获授权。
- 当前产品 UI/package 使用 Sundew 名称；2026-09-07 实测 remote 为 `Jingxx32/sundew`，默认分支为 `main`。本地目录和计划中的 Azure 资源继续使用 `lumiere` 标识，避免上线同时迁移资源名称。

## 2026-09-07 用户确认的发布约束

- 订阅显示名称：`Azure subscription 1`（用户提供；ID / tenant 待登录核验）。
- Azure 支出目标为 0；用户提供的 Azure Free services 页面已确认首年免费期于 2027-05-30 到期（取代先前 4 月底的估计）。Files 分项额度已确认：100 GB-month，读/协议各 40,000 次，写/列举各 10,000 次；实际费用与其余资源用量仍需核验。创建资源前逐项验证 SKU、免费额度、共享用量、存储、日志与出站；无法满足零支出目标时先调整方案，不自动接受收费。
- 预算告警不等于硬停止消费，不承诺仅靠告警保证零账单。原资源方案仍需通过费用验收。
- OpenAI 约 10 刀，按用户“能用很久”的描述暂记为个人使用与 demo 共用的一笔总预算，不按每月自动重置；币种待确认。不据此自动充值或调用付费服务。后续费用账本应支持累计预算，而不仅是每日次数限制。
- 首发界面采用当前 Sundew；方向已确认，技术与跨设备 UI 验收仍需执行。
- 用户确认尚未配置 Speech；私有首发暂不启用发音评估，不为上线自动创建 Speech 资源。T7 中发音评估端到端验收延后到实际启用时；首发验收缺失 Speech 配置时可正常启动并给出清晰提示。T4 录音存储本地验证可用测试音频独立完成，不因此假称 Azure 评估已通过。
- 公开 TCF 仅展示一套，题号、听力/阅读类型与题数待用户选定。替代原两套十题范围；公开素材仍需原创或有明确公开使用许可。未选题不阻塞本地构建与私有版准备。

## 2. 全局执行规则

1. 本计划由执行者逐项落实；每项记录实际结果再勾选，不预填成功。
2. 开始前保存 `git status --short`。当前工作区已有大量 UI/品牌改动；不覆盖、不丢弃、不用 `git add .` 混入提交。
3. 首次修改 Next.js 代码前阅读安装版本的相关文档，尤其 `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`、`01-app/02-guides/self-hosting.md` 及涉及的 Route Handler/API 文档。
4. 代码任务统一验证：`npx tsc --noEmit`、`npm run lint`、`npm test`。容器和部署任务另有生产 smoke test，不能用单元测试代替。
5. `.env*`、真题、个人数据、数据库备份、录音、云配置导出的 secret 值不得进入 Git、构建上下文、镜像层或日志。密钥通过 secret 管理；不要把实际连接串贴进命令历史和文档。
6. conventional commit 不带 `Co-Authored-By` / `Generated with` trailer。每次只暂存该任务的文件，提交前检查暂存 diff 和二进制文件清单。
7. 不自动提交、推送或部署尚未验收的工作。执行时按下面列出的里程碑推进即可，不需要为每个可逆本地步骤重新设计方案。
8. 先本地、再私有、后 demo；任何前置条件失败，修复后才进入依赖它的步骤。

## 3. 里程碑与依赖

| 阶段 | 任务 | 完成后可获得什么 | 前置 |
|---|---|---|---|
| A 本地基线 | T0–T2 | 测试入口、构建基线、许可证 | 无 |
| B 生产容器 | T3–T4 | 不含私有数据的镜像；录音可持久化和读取 | A |
| C 私有上线 | T5–T7 | 手机登录后可刷完整题库 | B |
| D 公开体验准备 | T8–T10 | 原创 demo 数据、权限隔离、费用闸门 | A；最终镜像依赖 B |
| E 发布 | T11–T12 | 公开 demo、受 CI 约束的自动部署及回滚 | C、D |
| F 展示与运营 | T13–T14 | README、录屏、费用与恢复验收 | E |

建议执行批次：第一次 A；第二次 B；第三次 C（到这里即可先自己使用）；之后 D、E；最后 F。时间取决于构建修复、Azure 权限和原创素材制作，不给未经验证的小时数保证。

## 4. 文件清单

| 文件/目录 | 计划变更 |
|---|---|
| `package.json` | test、demo 初始化/重置/校验等脚本 |
| `.github/workflows/ci.yml`、`deploy.yml` | 可复用检查与受门禁约束的发布 |
| `LICENSE`、`README.md` | 保留所有权利、真实截图、链接及体验说明 |
| `next.config.ts`、`Dockerfile`、`.dockerignore` | standalone、完整运行依赖、严格构建上下文 |
| `.gitignore` | 精确放行原创 demo JSON；保护部署记录和备份 |
| `data/demo-tcf/` | 原创题目、解释、素材来源清单 |
| `public/demo/tcf/` | 原创音频与图片；与私有 media 分开 |
| `scripts/seed-demo-tcf.ts`、`seed-demo-content.ts` | 严格限于 demo 数据库的初始化 |
| `scripts/reset-demo.ts`、`verify-demo.ts` | 可重复重置、内容与隔离校验 |
| `src/lib/demo.ts`、限流模块及对应测试 | 服务端能力闸门、持久化配额、开关 |
| `src/lib/actions/*`、相关 `src/app/api/*` | 覆盖付费调用、公开写入与导入限制 |
| 录音存储模块、录音 GET Route Handler | 启动后新增文件读取、路径约束、缓存策略 |
| `drizzle/` | 如持久配额需要新增表，提交对应迁移 |
| `infra/` | 脱敏的完整部署模板、账号授权模板、发布说明 |
| `docs/private/deployment/` | 本地执行记录、资源清单；不进 Git |
| `docs/images/` | 仅使用 demo 内容生成的展示素材 |

## T0 — 固定执行基线和资源参数

- [ ] 记录当前分支、commit、未提交文件；确认要发布的 UI/品牌改动已经完成评审。确需新分支时使用 `codex/` 前缀。
- [x] 确认仓库实际 remote、默认分支、GitHub owner/repo：2026-09-07 `git ls-remote --symref origin HEAD` 确认为 `Jingxx32/sundew`、`main`。
- [ ] 检查 Node/npm/Docker/az/psql 是否安装；缺什么再安装什么。Node 版本与后续容器和 CI 一致。
- [ ] 在本地执行记录填写下表；秘密只保存到密码管理器或受保护的环境文件。

| 参数 | 值/规则 |
|---|---|
| Azure subscription / tenant | `Azure subscription 1`（用户提供）；ID / tenant 待核验 |
| region | 首选 `canadacentral`，确认现有 PG、Speech 实际区域 |
| resource group / ACA environment | 沿用已存在且适合的资源，或创建 `lumiere-rg` / `lumiere-env` |
| PG server / private DB | 查现有实例，不重新创建个人库 |
| demo DB | `lumiere_demo` |
| storage account / share | 全局唯一小写账号；共享 `media` |
| registry | `ghcr.io/<owner>/<image>`；明确包的 public/private 状态 |
| budget | Azure 0 支出；OpenAI 约 10 刀总预算（币种待确认），不把免费额度视为总账单保证 |
| rollback | 上一个可用镜像 digest、revision、数据库恢复点 |

验收：资源清单完整，确认当前本地改动归属，未创建收费资源。

## T1 — 测试入口与 CI 基线

- [x] 执行现有测试入口；2026-09-07 实测 65 pass / 0 fail。沙箱内 tsx IPC 被拒，使用允许 IPC 的环境重新执行同一测试命令通过。
- [x] 新增 `"test": "tsx --test 'src/**/*.test.ts'"`。
- [x] 执行 `npx tsc --noEmit`、`npm run lint`、`npm test`，本地均通过；Node 22.23.2 下另验证 `next typegen && tsc --noEmit`。
- [x] 新建 CI：PR、main push 和 `workflow_call` 可调用；依次 checkout、从 `.nvmrc` 固定 Node 22.23.2、`npm ci`、`next typegen` 与类型检查、lint、test。此项仅表示 workflow 已创建，不代表 GitHub 已运行。
- [ ] 后续 T3 完成后，将无真实 secret 的生产镜像构建检查加入 CI。
- [ ] 新 workflow 首次运行后记录 URL 和对应 commit；只有实际绿灯才勾选。

验收：本地检查全过，GitHub 对同一提交检查全过。提交建议：`chore: add test command and CI checks`。

## T2 — LICENSE 与素材边界

- [x] 新建 All Rights Reserved LICENSE，著作权人为 Jingxuan Xu，年份 2026；限定代码公开用于作品集评估。第三方依赖和资源保留其各自许可证。
- [x] README 明确“公开可读源码，不是开放源代码许可”。
- [x] 建立 `docs/demo-content-sources.md` 来源登记表，明确原创 demo 素材尚待 T9 制作和逐项验收；未复制真题或个人学习笔记。
- [x] 删除待发布 README 中未经核验的题数、表数和分类数量描述；未增加未经核验的授权或成本断言。

验收：代码许可和素材来源说明分开；不承诺法律上的绝对结论。提交建议：`docs: clarify code license and demo content policy`。

## T3 — standalone 与可重现容器构建

- [ ] 在可恢复的工作目录运行一次现有生产构建，记录错误。构建覆盖 `.next`，测试后重启开发服务。
- [ ] 检查构建时数据库访问、OpenAI client 初始化、远程字体等依赖；构建不得连接个人库或执行真实 AI 调用。需要数据库的页面按本地 Next 文档改为运行时渲染；如 SDK 构建阶段即索取 key，调整为运行时初始化，不注入真实密钥。
- [ ] `next.config.ts` 加 `output: "standalone"`，保留 `serverExternalPackages`。
- [ ] Docker 使用多阶段构建、Node 22 的受支持基础镜像、`npm ci`、非 root runner；优先 Debian slim，减少 PDF/native 依赖与 Alpine 的兼容性变量。实施时固定具体版本或 digest。
- [ ] runner 复制 `.next/standalone`、`.next/static`、经审查的 `public`；设置 `PORT=3000`、`HOSTNAME=0.0.0.0`、production。对运行时需要写入的缓存/录音目录显式配置权限。
- [ ] `.dockerignore` 至少排除以下内容；额外检查根目录、隐藏目录及备份文件，不能认为这份最小清单涵盖所有私有文件。

```dockerignore
node_modules
.next
.git
.env
.env.*
public/media
media-private
data
docs
scripts/.tcf-cache
.claude
.codex
.agents
.superpowers
.worktrees
*.log
*.dump
*.sql.gz
```

`public/demo/` 单独进入镜像；不对 `public/media` 增加任何例外。demo JSON 由受控的本地/迁移流程 seed，不要求进入应用镜像。

- [ ] 检查 PDF parser、worker、传递依赖和 native 依赖。若 tracing 缺文件，用精确 `outputFileTracingIncludes` 或完整依赖处理；只复制 `pdf-parse` 顶层目录不算修好。
- [ ] 本地 `docker build -t lumiere:local .`，记录体积、架构。Mac ARM 构建不可直接假定能在云端运行；发布明确生成 `linux/amd64`（执行时确认目标支持情况）。
- [ ] 用临时测试库和运行时环境文件启动容器，端口绑定 `127.0.0.1:3001:3000`；环境文件不进入构建。避免本地 smoke test 写入个人生产数据。
- [ ] 验证 `/library`、`/today`、`/progress`、`/vocabulary`、`/tcf`；使用可公开的 PDF 实测解析。缺少密钥的功能应得到预期错误，不影响应用启动。
- [ ] 检查最终镜像文件清单、构建上下文和层内容；确认无真题、env、备份、私有笔记。体积只是辅助信号。
- [ ] 在 GitHub 干净 checkout 中构建成功，保证本地未跟踪文件不是隐含依赖。

验收：无生产数据/密钥的可重复镜像构建、页面 smoke test、PDF 实测通过。提交建议：`build: add verified standalone container`。

## T4 — 私有媒体与录音持久化

本地安装的 Next 16.2.4 在生产启动时扫描 `public` 文件清单（`node_modules/next/dist/server/lib/router-utils/filesystem.js`）。因此启动后新录音不能仅凭 `writeFile(public/...)` 就假设能立刻访问。

- [ ] 真题媒体仍可在进程启动前挂到 `/app/public/media/tcf` 所属目录，保持已有数据库路径兼容。
- [ ] 把新增录音存储改为服务端目录配置，例如 `RECORDINGS_DIR=/mnt/private-media/speaking`，不依赖 public 静态文件发现。
- [ ] 增加按 session/recording ID 读取录音的 Route Handler；限制 UUID、文件名和根目录，拒绝路径穿越；检查相应数据库记录，返回正确 MIME、`Cache-Control: private, no-store`，按播放器需求支持 Range。
- [ ] 更新新录音的数据库 `audioPath` 和播放器；对既有 `/media/speaking/...` 路径提供映射或受控迁移。禁止全表无条件替换未经检查的路径。
- [ ] 挂载同一共享到应用需要的目录（可同时提供兼容的 public 媒体视图和 `/mnt/private-media`）；不要把真题文件搬入镜像。挂载路径及权限必须与最终完整模板一致。
- [ ] 模拟生产容器：播放挂载的音频/图片，录音后立即播放，重建容器后仍能播放；验证非 root 账号可写。
- [ ] 验证音频 seek、缺失文件 404、越界路径拒绝；demo 模式下录音写入/读取入口应被服务端拒绝。

验收：立即播放和重启后播放都通过，不能只检查文件存在。提交建议：`fix: persist and serve recordings in production`。

## T5 — Azure 资源、备份和私有运行账号

- [ ] `az login` 后确认订阅/tenant；查看现有 PG SKU、免费权益起止、区域、网络设置和当前用量。历史 SKU B1ms 待确认；免费服务截图显示到期日 2027-05-30；PG 当前运行/存储计量在额度内，备份用量与账单仍待核验。
- [ ] 在动数据库权限或迁移前建立恢复点，并验证备份可恢复到临时数据库；备份留在受保护位置。
- [ ] 在现有 PG server 创建独立私有运行角色，只授予本库所需 schema/table/sequence 权限，不授予建库、建角色或管理员权限。现有本地连接暂保留，先验证新角色。
- [ ] 管理/迁移账号只用于受控迁移，不放进应用环境；之后每次新表迁移确认运行角色能访问所需对象。
- [ ] 配置 PG TLS 及可达网络；确认 ACA 实际出站来源与防火墙策略。不要因连接失败就长期开放所有公网来源或所有 Azure 服务。
- [ ] 创建/复用 Consumption 环境、Standard LRS 文件存储、私有共享。确认网络允许所选 SMB 挂载；设置容量和日志保留策略。
- [ ] 根据实测内存选 CPU/内存初值，记录启动峰值；单 revision、`minReplicas=0`、`maxReplicas=1`，后续据冷启动和 OOM 记录调整。
- [ ] 配置预算与费用警报，包含 PG、ACA、Files、日志、出站流量、Speech；核验 ghcr 当前计费与配额。

验收：恢复路径已验证，非管理员私有账号可用，网络与预算有记录。

## T6 — 上传和核对私有媒体

- [ ] 本地枚举 `public/media`，生成相对路径、字节数、SHA-256 清单，记录实际文件数和总大小。旧计划的 1.7 GB、3175 文件、43 目录仅作历史参考。
- [ ] 使用 Azure Files upload-batch 或 AzCopy 上传到共享，凭据通过受保护环境/短期凭据传入，不打印密钥。
- [ ] 递归枚举云端所有目录和文件，比较相对路径及大小；下载抽样并比对 SHA-256，必要时全量回读校验。
- [ ] 对缺失、大小不符或上传失败的文件补传；只看顶层目录、`head` 输出不算完整性验证。
- [ ] 明确上传后不自动删除云端独有的录音；后续同步不能用未经审查的镜像删除模式。

验收：清单一致、抽样哈希一致、上传错误为零。

## T7 — 先鉴权，再接入真实数据，发布私有实例

- [ ] 先部署一个**无数据库、无密钥、无媒体**的占位容器用于获得应用 URL；或者先禁用 ingress。不要让真实应用在鉴权前暴露。
- [ ] 在 Azure Portal → Container App → Security → Authentication 配置 Microsoft Entra；设为 Require authentication，未登录跳转登录。
- [ ] 配置单租户 issuer、应用 audience 和正确 callback `https://<fqdn>/.auth/login/aad/callback`。
- [ ] 在对应 Enterprise application 开启 `Assignment required = Yes`，仅分配本人用户；记录 client secret 到期日。单租户登录本身不等于仅本人可用。[Entra 接入文档](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra)、[限制指定用户](https://learn.microsoft.com/en-us/entra/identity-platform/howto-restrict-your-app-to-a-set-of-users)。
- [ ] 在占位实例验证：匿名不能读取内容；本人可登录；未分配账号不能访问。无第二账号时记录该项待验证，不声称完全通过。
- [ ] 推送 T3/T4 验证过的镜像并记录 digest。明确 GHCR 包可见性：public 包可匿名拉取；private 包配置专用只读拉取凭据，不使用 Actions 临时 token 作为长期拉取凭据。[GHCR 文档](https://docs.github.com/en/packages/working-with-the-container-registry/working-with-the-container-registry)。
- [ ] 注册环境级 Files storage，再生成完整 Container App 配置：image、resources、env/secretref、volumeMounts、volumes、scale、ingress、probes 等；更新前保存脱敏配置和恢复用原配置。不要用只含 image/volumeMounts 的片段假设数组会自动合并。[存储挂载文档](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts)。
- [ ] 保持已验证的认证配置，部署真实镜像、私有运行账号、私有 OpenAI/Speech secret 和媒体卷。Speech region 使用 Speech 资源实际区域，不从 ACA region 推断。
- [ ] 探针分别验证进程存活和就绪；健康端点不返回版本密钥、连接串或个人信息，不放开其他匿名路径。
- [ ] 验证本人跨设备登录、页面、题目、音频播放/seek、图片、写作反馈、发音评估和新录音重启后播放。
- [ ] 再验证匿名访问页面、直接媒体 URL、录音 GET、POST/API 均无法获取私有内容；检查旧 revision/标签 URL，没有不受保护的旁路。

验收：**私有上线里程碑**。真实数据从未先于鉴权上线；记录 URL、digest、revision、验证设备和结果。此时可以暂停后续工作，先日常使用。

## T8 — 创建 demo 库和严格 seed 守卫

- [ ] 在同一 PG server 创建 `lumiere_demo`，使用独立 demo runtime 与迁移身份，不复用私有 runtime。
- [ ] 审查数据库的 `PUBLIC CONNECT`、schema CREATE、角色继承和跨库访问设置；撤销会破坏隔离的默认授权，给各自运行身份显式授予本库所需权限。修改前保留管理员恢复通路。[PostgreSQL GRANT](https://www.postgresql.org/docs/current/sql-grant.html)。
- [ ] 用 demo runtime 实测连接个人库被拒；用 private runtime 实测连接 demo 库被拒。只检查不同用户名不算验收。
- [ ] 每个 demo seed/reset/verify 脚本要求显式 `DEMO_DATABASE_URL`，不得回退到 `.env` 中的个人 `DATABASE_URL`。
- [ ] 解析 URL 的数据库名并要求精确等于 `lumiere_demo`，连接后再查询 `current_database()`；同时核对预期 host。禁止 `url.includes("lumiere_demo")`；报错不输出完整 URL。
- [ ] **先迁移，后 seed**：使用 demo 迁移凭据把已有 Drizzle migrations 应用到空库，然后授予 runtime 权限。检查当前迁移是否有额外扩展/权限要求。
- [ ] 不直接运行通用 `db:seed`：现有脚本含标为 `Personal journal` 的文本和需核验来源的示例。改用 T9 的 demo 专用内容；`seed-rules` 也先审查来源和目标库再执行。

验收：空 demo 库 schema 完整，交叉连接被拒，错误目标 seed/reset 在任何写入前失败。

## T9 — 原创 demo 内容、媒体与可重复初始化

- [ ] 使用 `data/demo-tcf/` 存 JSON，`public/demo/tcf/` 存媒体。更新 `.gitignore` 时将原 `data/` 规则改为：

```gitignore
data/*
!data/demo-tcf/
data/demo-tcf/*
!data/demo-tcf/*.json
!data/demo-tcf/README.md
```

保留 `public/media/` 全量忽略；`public/demo/` 无需重新包含被排除的祖先目录。

- [ ] 用户选定一套展示题后确认 skill、题数与公开使用依据；如来源未获确认，使用原创展示套题。字段精确匹配现有 schema：skill、level、type、orderIndex、questionText、options、answer、transcript/passage、audioPath/imagePath、解释字段。
- [ ] 按选定套题建立逐题素材清单；仅验收该套题实际包含的题型，不再要求原两套十题与四种题型的组合。

- [ ] 每题 4 个选项、answer 为 0–3、唯一 orderIndex、唯一正确答案；为 demo 的讲解页准备人工审阅解释，不能只 seed 裸题导致展示空页。
- [ ] 复用现有 TTS 流程的能力，先确认脚本输入格式；不假设直接支持新 JSON。按当前价格估算并记录调用量，再生成音频，人工听完核对题意和选项顺序。
- [ ] seed 中媒体地址固定 `/demo/tcf/...`；确认选定套题需要的全部音频和题图已被 Git 跟踪。记录原创文本/图片/TTS 的来源和生成方式。
- [ ] TCF seed 在事务中运行，使用明确 demo 标识管理自制题；避免删除未知 test_number=1 数据。检查现有外键级联，重跑不误删其他学习记录；破坏性重置只由 reset 脚本负责。
- [ ] `seed-demo-content` 加入原创文章、示例词汇、示例写作与反馈/进度；能展示空状态和有数据状态。所有示例标为模拟内容。
- [ ] `reset-demo` 只操作已严格核验的 demo 库；保留 T10 配额账本，避免重置内容顺便清空费用闸门。reset 事务失败不得留下半套数据。
- [ ] 顺序执行迁移 → 内容 seed → TCF seed → verify；重跑一次确认幂等。
- [ ] 重新构建并在**干净 checkout** 验证媒体存在、私有 media 不存在；检查 `git ls-files data/demo-tcf public/demo` 和暂存清单。

验收：选定的一套题完整，题数与清单一致，素材可公开使用，所有媒体可播放/显示，解释正常，重复 seed 不增加重复记录。

## T10 — 公开能力边界和完整费用闸门

- [ ] 服务端 `DEMO_MODE=1` 集中判定；增加启动配置校验：明确声明部署角色，并核对预期数据库名；公开部署缺失/错配 demo 模式时拒绝就绪，不默认按私有版放行。UI 显示共享体验环境说明，提醒不要输入个人敏感信息，说明数据会重置。
- [ ] demo 服务端禁止录音写入、任意 PDF/音频/外部 URL 导入和修改服务配置；提供明确的可用示例入口。只隐藏按钮不算限制。
- [ ] 遍历所有 AI/Speech 调用链建立清单：至少覆盖 tasks、vocabulary、quiz、speaking、cloze、errors、documents，以及 `/api/speaking/assess`；settings 的连通测试也需要关闭或受控。
- [ ] 在对外操作边界计数一次，内部嵌套调用不重复消耗访客操作额度；每次实际付费调用另计全局配额，包括重试、多模型步骤和转录。
- [ ] 默认访客上限 20 次 AI 操作/小时；共享出口可能共用额度。仅在验证 ACA 转发链后使用可信客户端 IP；不能盲取用户可伪造的 `x-forwarded-for` 首项。
- [ ] 若无法可靠识别 IP，使用匿名会话额度作为体验限制，同时依靠全局配额控制总量，不把可重建 cookie 当成可靠防刷身份。
- [ ] 在 demo DB 实现持久化、事务原子性的全局配额，初始建议 100 次付费调用/UTC 日，作为可调整的产品默认值；以输入长度、最大输出、单操作调用次数和超时限制约束每次成本。该数字不是美元硬上限。
- [ ] 调用前原子预占配额；并发不得越过上限，进程/容器重启不得清零；账本不可用时 demo AI 拒绝调用。若声称按金额封顶，必须另外按最坏调用成本预留额度，不能仅统计调用次数。
- [ ] 配置 demo 独立服务凭据/项目和 `DEMO_AI_ENABLED` 紧急开关；使用已有模型映射。关闭后付费调用立即停止，浏览和静态示例仍可用。
- [ ] API 被限流时返回 429 和合理 Retry-After；Server Action 返回可理解的错误，不留下 spinner、不把堆栈暴露给访客。
- [ ] 有针对性测试：边界时间、跨入口共享额度、并发抢最后额度、重启不重置、禁用入口直调失败、错误模式 fail-closed、内部嵌套不双计操作。
- [ ] 使用 mock 验证第 21 次被拒；无需为了测限流真实调用模型 21 次。另做少量真实 demo 模型 smoke test。
- [ ] 执行类型检查、lint、test，并检查所有新迁移。

验收：全部付费入口受控或被禁用；伪造来源头、换会话、重启均不能绕过全局配额。

## T11 — 部署公开 demo

- [ ] T8–T10 全部验收后，构建新镜像，记录 digest；与私有版使用同一经过测试的 artifact。
- [ ] demo 配置独立 DB/runtime、demo API secret、`DEMO_MODE=1`、AI 开关和配额；无私有卷、无私有账号、首期无 Speech secret。
- [ ] 首次部署先禁用外部 ingress 或只运行无数据占位容器；确认 schema/seed/运行配置正确后才开放 demo。
- [ ] 部署参数明确 resources、single revision、0–1 replicas、健康探针、secretref；核对更新没有丢失环境变量。
- [ ] 匿名浏览首页和核心路径；完成阅读 → 查词 → 写作 → 反馈，以及 TCF 听力/阅读/讲解。
- [ ] 核对数据库只有原创题；进度/词汇/写作只含模拟或 demo 访客数据，没有本人历史。
- [ ] 使用私有库实际存在的真题媒体路径测试 demo 返回 404，并验证私有录音路径不可访问；不能只猜一个本来就不存在的文件名。
- [ ] 验证关闭的接口从网络直调也被拒、限流错误友好、紧急开关有效；浏览器控制台和服务器日志没有关键错误。
- [ ] 实测冷启动，记录手机和桌面加载表现；不承诺“十几秒”。体验不可接受时评估常驻成本再调整 minReplicas。
- [ ] 为共享 demo 定义重置频率（建议每日一次或每次正式演示前）；先手动验证 reset，再接定时任务。重置时阻止写入竞态，且不清除配额账本。

验收：**公开 demo 里程碑**。记录 URL、digest、全部隔离测试和核心流程结果；此时才把链接放到 README。

## T12 — 自动部署、迁移与回滚

- [ ] 发布 workflow 使用 `workflow_dispatch` 和 main push；PR 仅运行检查。通过 `needs` 调用 T1 可复用 CI，确保检查失败不会发布。
- [ ] 构建 Linux 目标镜像，运行镜像内容检查后才推送；tag 使用 git SHA，部署使用 digest，latest 仅作便捷别名。
- [ ] 每次发布复用同一镜像，不为两个环境各构建一次；不通过 build args 注入真实 DB/API secret。
- [ ] Azure 登录使用 GitHub OIDC 联邦凭据，绑定预期 repo/branch 或 GitHub environment；最小化资源范围。配置 `id-token: write`，避免保存长期 Contributor JSON。[GitHub Azure OIDC 文档](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)。
- [ ] 发布设置 concurrency，串行处理同环境更新，不在迁移中途取消正在运行的部署。
- [ ] 无 schema 变更：检查 → build/验证 → push → 更新私有版 → 私有验收 → 更新 demo → demo smoke test。私有交互验收可由受控发布环境检查点完成，不为自动化放开 Easy Auth。
- [ ] 有 schema 变更：先在 demo/临时库试迁移和兼容性 → 备份个人库 → 用迁移身份执行向后兼容迁移 → 更新私有版 → 验收 → 更新 demo。首期生产迁移保留为有记录的手动步骤，CI 不静默执行破坏性 SQL。
- [ ] 发布前保存两个 app 的上一 digest、revision、脱敏配置；认证资源单独管理，常规 image update 不修改认证。
- [ ] 发布失败：停止后续实例更新；回切上一 image/revision，确认环境变量和挂载保留。应用回滚不等于数据库回滚，破坏性 migration 需要独立恢复方案。
- [ ] 演练一次 demo 回滚；私有版演练采用兼容版本，确认媒体和录音不随容器替换丢失。
- [ ] 测试一次故意让 CI 失败的分支/测试 PR，确认不会部署；真实成功发布记录 workflow URL 和 SHA。

验收：失败检查阻止发布、同 artifact 双部署、可恢复到上一版本；CI 绿灯不能替代业务验收。

## T13 — 作品集和 README

- [ ] 仅从原创 demo 内容截图：写作反馈 hero、TCF drill、示例 progress；不要把空进度页当最终展示。
- [ ] 录 10 秒核心闭环 GIF（控制体积），另录 2–3 分钟原创内容 walkthrough。
- [ ] 需要说明完整题库规模时使用经核验的聚合数字/架构说明，不在视频中展示未经确认可公开的题目、音频和个人数据。
- [ ] README 首屏加入真实 CI badge、已验收的 demo URL、真实录屏链接、截图。品牌名称跟随最终 UI。
- [ ] 说明 demo 原创题数量、共享数据和重置、可试用功能、限流以及私有版独有的录音能力。
- [ ] “How this was built” 链接真实文档；数字现场统计，不保留旧计划的 117 commits/9 specs 等固定值。
- [ ] 检查截图、GIF、录像、源码中没有账号、token、私有 URL 参数或个人学习记录；所有链接实际打开检查。

验收：招聘者能从首屏进入 demo，并完成一条真实体验流程。

## T14 — 成本、恢复和最终交付

- [ ] 查看部署后实际账单和计量明细，至少覆盖一次有流量的观察周期；账单延迟期间不写“已确认零成本”。
- [ ] 分别记录 ACA CPU/内存/请求、Files 容量/事务、PG/备份、日志、出站、Speech、AI 和 registry 用量。两个 app 不能各自假设独享一份免费额度。[ACA 定价](https://azure.microsoft.com/en-us/pricing/details/container-apps/)。
- [ ] 核实 PG 免费权益到期日，建立到期前处理条目；未来迁移其他提供方要测试 TLS、扩展、连接池、备份和恢复，不承诺只改连接串即可。
- [ ] 验证预算警报可达。预算警报与停用付费功能是两回事；应用紧急开关独立演练。[Azure 预算自动化](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/manage-automation)。
- [ ] 记录数据库和 Files 的备份频率、保留期限、恢复步骤；抽样恢复一条录音和测试数据库。
- [ ] 记录维护项：Entra secret/registry 拉取凭据到期、依赖更新、配额调整、demo reset、资源删除清单。删除云资源前先确认数据备份。

预算表（执行时填写，不作为当前报价）：

| 项目 | 免费权益/计费依据 | 月度预计 | 实际/观察日期 |
|---|---|---|---|
| PostgreSQL + 备份 | SKU、订阅权益、到期日 | 待填 | 待填 |
| Container Apps ×2 | 合并核验订阅免费额度和资源用量 | 待填 | 待填 |
| Azure Files | 容量、事务、冗余 | 待填 | 待填 |
| 日志/网络 | 摄取、保留、出站 | 待填 | 待填 |
| OpenAI / Speech | 模型、调用量、音频时长 | 待填 | 待填 |
| GHCR | 可见性与当前套餐 | 待填 | 待填 |

## 5. 最终验收清单

- [ ] 同一提交的类型检查、lint、test、生产构建与 GitHub CI 全过。
- [ ] 干净 checkout 可构建；镜像和构建层没有真题、个人数据或 secret。
- [ ] 私有版本人可访问，匿名及未分配用户不可访问；页面、媒体、录音和 API 都验证过。
- [ ] 私有版题库媒体正常，新录音立即可播放且容器替换后仍在。
- [ ] 两个 runtime 账号无法连接对方数据库；应用不使用管理员凭据。
- [ ] demo 选定的一套题和素材齐全且可公开使用，无真实个人数据，真题实际路径返回 404。
- [ ] demo 写作/阅读核心闭环可用；关闭的导入/录音接口在服务端拒绝。
- [ ] 跨入口限流、持久全局配额、并发边界、重启和紧急开关全部通过。
- [ ] CI 失败不发布；迁移和镜像回滚方案实测，认证与挂载不会被发布覆盖。
- [ ] README 图片和链接真实可用，录屏内容可公开。
- [ ] 费用记录与预算一致，未验证的费用/权益明确待确认；备份可恢复。

## 6. 每项执行记录模板

复制到 `docs/private/deployment/`，不要把秘密写进记录：

```text
任务：T__
日期 / 执行者：
代码 SHA / 镜像 digest / revision：
前置检查：
操作及验证命令（脱敏）：
实际结果 / workflow URL：
失败原因及修复：
是否完成：待执行 / 进行中 / 阻塞 / 已验收
下一项：
回滚点：
```

文档修订完成后的下一步是 **T0 → T1**，不是直接运行 Azure 创建命令。
