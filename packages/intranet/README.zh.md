# intranet/ — 公司内网工具 Consumer

[English](README.md) | 中文

面向模型的公司内部服务工具,迁移自 hydra-agent 工具集。本组承载访问外部内网 REST API 的 Consumer;它们都不是能力接缝——每个包自有其 HTTP 客户端,凭证引用在调用时经凭证接缝解析。部署通过 `@deepseek-ai/dsh-intranet` bundle 挂载它们,而非 `dsh-base`。

| Package | Role | ctx key |
|---|---|---|
| [`tool-wiki/`](tool-wiki/README.md) | Confluence 风格 Wiki 读取与审批门控回写工具 | registers on `ctx.tools` |

迁移理由与刻意推迟的接缝拆分记录在[迁移 Agent Note](../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.md)。
