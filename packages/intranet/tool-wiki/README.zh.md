# @deepseek-ai/dsh-intranet-tool-wiki

[English](README.md) | 中文

面向模型的内网 Wiki 工具,基于 Confluence 风格 REST 端点:有预算约束的页面读取,加上两步式回写,其中执行步经过审批接缝。

## 功能

在 `ctx.tools` 上注册三个工具:

- `intranet_wiki_read_page` — 按 URL 或页面 id 读取单页,或(仅在用户明确要求时)广度优先读取该页及其子孙页,在深度、页数、单页与整次调用字符预算内把 storage HTML 转为纯文本。规范值是一个页面列表(根页在前),`completeness` 报告 `complete`、`partial_tree`、`partial_access` 或 `partial_content`。
- `intranet_wiki_prepare_write` — 回写的只读第一步:校验目标、把 Markdown 渲染为 storage 格式,并返回写入计划(目标页、生效标题、追加所需的 `baseVersion`、完整 `contentMarkdown` 与标题摘要),不改动 Wiki。
- `intranet_wiki_apply_write` — 写入本身:`create_child` 在父页下创建子页,`append_page` 在标题下以下一版本号追加。`baseVersion` 不再匹配时返回领域结果 `status: 'version_conflict'` 而不写入;基础设施失败则抛错。

Wiki 端点是公司 Confluence 风格 REST API;客户端、HTML 转文本与 Markdown 转 storage 转换器移植自 hydra-agent 实现([Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.md))。

## 审批策略

`applyWriteApproval` 为必填:每个组合都必须选择 `intranet_wiki_apply_write` 的执行方式。在 `ask` 下,插件注册一个 `tools/pre-execute` 监听,恰好对该工具返回 `{ kind: 'ask' }`,因此每次调用都经过 `ctx.approval`,在没有审批接缝或拥有者 Agent 时失败关闭。在 `allow` 下直接执行。待执行卡片的原始输入携带完整 `contentMarkdown`,审批者能看到将写入的确切内容。

## 凭证

配置携带凭证引用名(`baseUrlEnv`、`tokenEnv`),从不携带值。每次调用在组合了凭证接缝时经 `ctx.credentials` 解析,否则从启动环境解析;值缺失或为空时调用失败,并给出点名未解析引用的补救指引。

## 配置

只有 `applyWriteApproval` 没有默认值。`readTimeoutMs`(60000)与 `writeTimeoutMs`(30000)作为协作式 `ToolDefinition.timeoutMs` 预算挂载,由组合的超时策略执行;每个 fetch 都转发 `exec.signal`,因此取消与超时会停止进行中的请求。`read` 块承载模型可见预算及其上限:`defaultMaxChars` 60000(上限 `maxChars` 100000)、`totalMaxChars` 150000、`maxDepth` 10、`defaultMaxPages` 30(上限 `maxPages` 100)、`defaultMaxCharsPerPage` 20000(上限 `maxCharsPerPage` 60000)。默认值沿用迁移自 hydra-agent 的生产值,存放在 schema 与显式解析步骤共享的模块常量里。

## 校验

在 schema 检查之外,`execute` 执行跨字段规则:读取需要 `url` 或 `pageId`(descendants 范围需要可解析的页面 id),`create_child` 需要 `parentPageId` 与 `title`,`append_page` 需要 `pageId` 或 `targetWikiUrl`,`contentMarkdown` 去除首尾空白后必须非空。模型提供的预算会被收敛进配置的窗口。

## 呈现

三个工具的 `output.render` 都把规范值以美化 JSON 返回,与被迁移 Agent 的提示词消费方式一致。待执行卡片为 generic:读取用 `kind: 'read'` 并以目标页命名标题,执行步用 `kind: 'edit'` 并以动作与目标命名标题。读取与准备声明 `isConcurrencySafe`;执行步保持互斥。

## 导出形态

函数/命名空间插件:导出 `name` / `inject` / `Config` / `apply`,没有 default 导出([postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md))。

## Model Experience

### Tool schemas

#### What the model sees

生成的 [`dsh-intranet-tool-wiki` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-intranet-tool-wiki)。预算参数描述会插入配置的默认值与上限。

#### Token effect

三个工具在其可见的每个请求上有固定 schema 开销。

#### KV Cache effect

定义与可见性不变时前缀稳定;修改配置的预算或超时会改变插入的描述,并使 schema 段的复用失效。

### Tool-call history and result

#### What the model sees

每个保留的调用携带其参数(apply 调用保留完整 `contentMarkdown`)。成功以美化 JSON 返回规范值;过期的 `baseVersion` 返回 `version_conflict` 值,含当前版本与重新准备的指引。失败是错误结果:上述跨字段校验消息、HTTP 失败的 `Wiki API <status>: <body excerpt>`、凭证补救消息,以及——`ask` 下无审批通道时——门的理由 `This call writes to the intranet wiki.`

#### Token effect

按调用条件计;读取结果受配置字符预算加 JSON 包装约束。

#### KV Cache effect

仅追加:结果进入保留转写,不改写更早的请求 token。

## Known Limitations and Deferred Work

- **无自动化真实写入覆盖** — 真实 API 冒烟只做读取与准备;对真实 Wiki 的 `create_child` 仅在 `INTRANET_WIKI_E2E_PARENT_PAGE` 指定沙箱父页时运行,常规 e2e 不会改动 Wiki。
- **仅第一版写入动作** — `create_child` 与 `append_page`;不支持替换或编辑既有页面内容,与被迁移实现一致。
- **手写转换器** — HTML 转文本与 Markdown 转 storage 是移植的 hydra 实现;维护型依赖的替换候选记录在[迁移 Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.md)。
