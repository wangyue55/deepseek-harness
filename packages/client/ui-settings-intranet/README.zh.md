# @deepseek-ai/dsh-client-ui-settings-intranet

[English](README.md) | 中文

内网凭证卡:插件设置标签页里的一个条目,展示 Wiki 与 GitLab 引用的配置状态,并经凭证域存储新值。

## 功能

Host 半注册 `intranet` settings 命名空间,其四个字段命名卡片寻址的凭证引用(`wikiBaseUrlEnv`、`wikiTokenEnv`、`gitlabBaseUrlEnv`、`gitlabTokenEnv`,默认与工具包相同的 `INTRANET_*` 名)。浏览器半注册一个 keyed `settings.plugin.item` 卡片:每个控件展示所寻址引用及其来自 `credentials.describe` 的已配置/可写状态,草稿本地暂存,一次保存经 `credentials.set` 写入——值落在凭证存储,从不进设置文档或任何响应。被关注引用的 `credentials/reference-updated` 事件会重读其徽标,别处写入的值在这里保持真实。

在工具配置里重命名了引用的部署,在本 section(组合配置或卡片自身的 settings 层)声明同名,卡片才编辑正确的键。

## 打包

双半插件:Host 半在 `src/`,浏览器半在 `src/client/`,`cordis.yml` 挂载本包时由 client 模块系统按构建产物 `./client` 提供。[`dsh-intranet`](../../bundle/intranet/README.zh.md) bundle 把它挂在工具旁;只有 Host 提供 `intranet` 命名空间的部署才渲染此卡。

## Model Experience

Indirectly, through `dsh-intranet-tool-wiki` and `dsh-intranet-tool-gitlab`, whose calls resolve the credentials this card stores; the card itself contributes no model-visible text.

#### KV Cache effect

无直接失效;工具包各自拥有其 schema 前缀效应。

## Known Limitations and Deferred Work

- **没有清除控件** — 卡片只写值,不提供清回未配置的操作;删除已存值需编辑 `.credentials.yaml`。
- **源码启动需要两条解析路径** — Host 半经 `tsconfig.base.json` paths 条目解析(`verify-cordis-config` 强制),而浏览器 bundle 由 Node 从 profile 锚点解析发现,源码启动的开发者需把本包符号链接进 `$DSH_HOME/profiles/node_modules`;经 `dsh plugin add` 的生产安装从 profile 自身模块解析。
