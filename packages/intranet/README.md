# intranet/ — company intranet tool consumers

English | [中文](README.zh.md)

Model-facing tools for company-internal services, migrated from the hydra-agent toolset. The group holds Consumers over external intranet REST APIs; none of them is a capability seam — each package owns its HTTP client, and credential references resolve through the credentials seam at call time. Deployments mount them through the `@deepseek-ai/dsh-intranet` bundle rather than `dsh-base`.

| Package | Role | ctx key |
|---|---|---|
| [`tool-wiki/`](tool-wiki/README.md) | Confluence-style wiki reading and approval-gated write-back tools | registers on `ctx.tools` |

The migration rationale and the deliberately deferred seam split live in the [migration Agent Note](../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.md).
