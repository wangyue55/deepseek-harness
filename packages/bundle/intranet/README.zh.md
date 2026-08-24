# @deepseek-ai/dsh-intranet

[English](README.md) | 中文

公司内网工具的 profile bundle:一个 patch 层,把 [`dsh-intranet-tool-wiki`](../../intranet/tool-wiki/README.zh.md) 与 [`dsh-intranet-tool-gitlab`](../../intranet/tool-gitlab/README.zh.md) 的行插入到 `dsh-base` 之上。

## Patch 挂载的内容

三行:三个 Wiki 工具在 `applyWriteApproval: ask` 下——每次 `intranet_wiki_apply_write` 调用都经过审批接缝,缺席时失败关闭——按默认值挂载的只读 GitLab 分析工具,以及[凭证卡片](../../client/ui-settings-intranet/README.zh.md),它把四个引用放上 Web 设置页。bundle 不携带凭证值:两个包的引用默认指向 `INTRANET_WIKI_BASE_URL` / `INTRANET_WIKI_TOKEN` 与 `INTRANET_GITLAB_BASE_URL` / `INTRANET_GITLAB_TOKEN`,每次调用经凭证服务或启动环境解析。

## 使用方式

把 bundle 加入 profile 的叠层列表([profile 契约](../../boot/app-boot/README.zh.md#profiles)),或用 `dsh plugin --profile <name> add @deepseek-ai/dsh-intranet` 在仓外安装。调用工具前导出四个引用值(或存入凭证服务);缺失时调用失败并给出补救指引。开发期用 `pnpm dsh web --patch packages/bundle/intranet/cordis.patch.yml` 在 web profile 上挂载同样的行。

## Model Experience

Indirectly, through `dsh-intranet-tool-wiki` and `dsh-intranet-tool-gitlab`, whose schemas and results this patch layer mounts; the bundle itself contributes no model-visible text.

#### KV Cache effect

无直接失效;挂载的工具包各自拥有其 schema 前缀效应。

## Known Limitations and Deferred Work

- **没有随发行的 profile 叠这个 bundle** — 部署按 profile 自行选入;尚无 intranet profile 模板。
