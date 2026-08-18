# Agent Note: 自 hydra-agent 迁移的内网 Wiki 工具

Status: implemented

[English](2026-08-18-intranet-wiki-tools.md) | 中文

## Problem

hydra-agent 项目基于 Confluence 风格 REST API 运行三个生产内网 Wiki 工具(`internal_wiki_read_page`、`internal_wiki_prepare_write`、`internal_wiki_apply_write`)。把它们迁入 dsh,意味着要把 hydra 工具内嵌的元数据——由 `riskLevel` 驱动的人工审批、按工具超时、结果大小上限、环境变量凭证、可用性隐藏——映射到 dsh 的插件、策略、凭证与呈现机制上,而不发明新机制。

## Decision

**单个 Consumer 包,不建能力接缝。**`@deepseek-ai/dsh-intranet-tool-wiki`(`packages/intranet/tool-wiki`)注册三个更名为 `intranet_wiki_*` 的工具,HTTP 客户端与转换器作为包内模块自持。后端只有一个(公司 Confluence 风格 API)、消费者只有一类,Service Definition / Provider / Consumer 拆分没有独立演化的角色支撑;其他进程内消费方经 Code Mode 触达这些工具。当出现第二个 Wiki 后端或非工具消费方时再拆接缝。

**hydra 元数据映射到既有 dsh 机制**,不新建:

- `riskLevel: high` + HITL → 本包内一个 `tools/pre-execute` 监听,在必填的 `applyWriteApproval: 'ask'` 配置下恰好对 `intranet_wiki_apply_write` 返回 `{ kind: 'ask' }`;`ctx.approval` 承接询问,缺席时失败关闭。待执行卡片携带完整 `contentMarkdown`,审批者审阅的就是确切写入内容。
- `timeout` → 来自 `readTimeoutMs`/`writeTimeoutMs` 配置的 `ToolDefinition.timeoutMs`,由 base 挂载的超时策略执行;每个 fetch 转发 `exec.signal`,这是 hydra 从未做到的。
- `maxResultSize` → 工具内获取预算成为 `read` 配置块;通用结果修剪归组合的修剪器。
- 环境变量凭证 → 配置携带凭证引用名,每次调用经 `ctx.credentials` 解析并以启动环境兜底(`web-search-deepseek` 模式)。
- `isAvailable()`(无凭证时静默隐藏)→ 刻意舍弃:挂载与否由组合决定,已挂载而引用未解析的工具带补救指引响亮失败。没有 Wiki 的部署不叠加 intranet bundle 即可。
- `concurrencySafe` → 读取与准备步声明 `isConcurrencySafe()`;执行步保持注册表的互斥默认。

**保真移植,只做契约层改动。**客户端、HTML 转文本与 Markdown 转 storage 转换器为行级移植(新增 signal 贯通与类型化 JSON 收窄)。字符串返回改为声明输出 schema 下的规范值:hydra 的两种读取形态合并为单一页面列表形态,`ok:false` 版本冲突改为领域结果 `status: 'version_conflict'`,`"Error: ..."` 字符串改为抛错。`output.render` 保持规范值的美化 JSON,与被迁移提示词的消费方式一致。诊断文案改为英文;回退标题 `AI 补充内容` 保持中文,因为它会写入 Wiki 页面。

## Alternatives considered

**现在就建 Wiki 能力接缝。**否决:当前没有第二个 provider 或非工具消费方;预发布姿态让日后拆分代价很低。

**用维护型依赖替换移植代码。**推迟,以保持对已测行为的保真。已记录候选:HTML 转文本一侧的 `html-to-text`(npm);`markdownToWikiStorage` 一侧面向 Confluence storage 格式的维护型 Markdown 渲染器;按 dependencies-over-hand-rolling 政策,二者被采纳时都能删除自有代码与测试。

**用结构化文本呈现替代 JSON。**推迟:被迁移的提示词与技能消费该 JSON 布局;由于规范值已是程序化 API,Native 文本渲染是后续的兼容改动。

**保留 `internal_wiki_*` 名称。**由迁移负责人否决,改用 `intranet_*`,与组、bundle 及默认凭证引用命名(`INTRANET_WIKI_BASE_URL` / `INTRANET_WIKI_TOKEN`)一致。

## Consequences

工具与 hydra 有四处可观察差异:已挂载但凭证引用未解析的插件按调用报错而非隐藏工具;取消与超时能真正停止进行中的 HTTP 工作;读取工具在两种范围下返回同一种页面列表形态;执行步审批是组合层策略,未组合审批接缝的自动化组合得到默认关闭的写工具。预算与超时由部署以配置持有;schema 描述会插值它们,因此改预算会扰动请求前缀。

## Verification

包测试覆盖:经注入 `fetchFn` 的客户端、经真实 `ToolRuntime` 对回环 Confluence 风格 stub 的工具(含 ask 失败关闭、版本冲突、取消与预算边界)、证明配置响亮失败与组合下 allow 写入的真实 Loader 组合,以及经 `dsh-credentials-local` 的凭证接缝解析。真实 API 冒烟在缺少 `INTRANET_WIKI_*` 时自跳过,唯一真实写入由 `INTRANET_WIKI_E2E_PARENT_PAGE` 把关。keyless ACP snapshot 场景对 fixture 服务器演练 读取 → 准备 → 审批门控执行。
