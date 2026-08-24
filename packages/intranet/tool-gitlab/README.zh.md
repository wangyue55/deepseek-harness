# @deepseek-ai/dsh-intranet-tool-gitlab

[English](README.md) | 中文

面向模型的 `intranet_gitlab_analyze_code_source` 工具:解析内网 GitLab 项目,从需求线索发现相关代码,读取有界的生效范围,并返回轻量影响分析。

## 功能

在 `ctx.tools` 上注册一个只读工具。调用给出 `projectLocator`(数字 id、最终项目名、完整 namespace 路径,或配置主机上的内网 GitLab URL),外加至少一个代码路径或需求线索(`moduleHints`、`routeHints`、`apiHints`、`uiTexts`、`changeDescription`)。流水线运行四个移植阶段:定位符解析、线索驱动的范围发现(blob 搜索并以路由/导入证据验证,与用户路径比对)、生效范围的有界并发读取,以及按文件的静态提取,聚合为 API/路由/组件/服务/DTO 视图与推断的副作用。

发现阶段还会探测项目的 `CLAUDE.md` 与公司约定的 `docs/agent/模块代码定位指南.md`,把链接到的指南作为 `guidanceFiles` 应用。未形成可验证范围时,规范值携带 `analysis: null` 加警告,而不是猜测。

客户端、解析器、发现器、读取器与分析器移植自 hydra-agent 实现;删除了 legacy 的 `projectRef`/`projectId` 定位回退,因此解析总是产出完整项目元数据([Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.zh.md))。

## 凭证

配置携带凭证引用名(`baseUrlEnv`、`tokenEnv`),从不携带值。每次调用在组合了凭证接缝时经 `ctx.credentials` 解析,否则从启动环境解析;值缺失或为空时调用失败,并给出点名未解析引用的补救指引。

## 配置

每个字段都有沿用 hydra-agent 生产值的默认值。`timeoutMs`(60000)作为协作式 `ToolDefinition.timeoutMs` 预算挂载;每个请求都转发 `exec.signal`。`hintLimit`(10)约束每个线索数组。`discovery` 块约束线索搜索:`maxQueries` 6、`searchPerPage` 20、`searchMaxPages` 2、`maxCandidateFiles` 24、`maxDiscoveredPaths` 30。`read` 块约束获取:`maxFiles` 60、`maxFileChars` 50000、`maxTotalChars` 180000、`readConcurrency` 6。默认值存放在 schema 与显式解析步骤共享的模块常量里;分析器的按列表提取上限属算法内部,保持固定。

## 呈现

`output.render` 把规范值以美化 JSON 返回,与被迁移 Agent 的提示词消费方式一致。待执行卡片为 generic,`kind: 'search'`,以定位符命名标题。工具声明 `isConcurrencySafe`。

## 导出形态

函数/命名空间插件:导出 `name` / `inject` / `Config` / `apply`,没有 default 导出([postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.zh.md))。

## Model Experience

### Tool schema

#### What the model sees

生成的 [`dsh-intranet-tool-gitlab` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-intranet-tool-gitlab)。

#### Token effect

工具可见的每个请求上有固定 schema 开销。

#### KV Cache effect

定义与可见性不变时前缀稳定。

### Tool-call history and result

#### What the model sees

每个保留的调用携带其参数。成功以美化 JSON 返回规范值:带生效 `ref` 的已解析项目、发现结果(`status`、证据、路径比对)、分析或 `null`,以及聚合警告与 `truncated` 标志。失败是错误结果:线索或路径的必备要求、定位符解析失败(未知、歧义、搜索截断、主机不匹配)、`'ref' was omitted and the GitLab project has no default branch`、HTTP 失败的 `GitLab <resource> <status>: <body excerpt>`,以及凭证补救消息。

#### Token effect

按调用条件计;结果受配置的发现与读取预算加 JSON 包装约束。

#### KV Cache effect

仅追加:结果进入保留转写,不改写更早的请求 token。

## Known Limitations and Deferred Work

- **构造上只读** — 工具只发 GET 请求;对 GitLab 没有写入面。
- **正则级分析** — 导入、导出、符号、API 调用与路由来自移植的正则提取而非解析器;按列表上限(40/60)约束每个文件的贡献。
- **偏前端的启发式** — 证据验证以路由/模块注册模式与动态导入为关键,与被迁移的需求评审用例一致。
