# Agent Note: 内网凭证设置卡

Status: implemented

[English](2026-08-18-intranet-credentials-card.md) | 中文

## Problem

内网工具每次调用解析四个凭证引用,但产品没有录入值的界面:部署只能手工编辑 `.env` 或 `.credentials.yaml`。Wiki 写路径虽已带补救指引地响亮失败,但设置页控件才是已挂载能力可被发现的配置入口。

## Decision

**一个双半插件 `@deepseek-ai/dsh-client-ui-settings-intranet`,遵循 settings-card cookbook。**Host 半提供 `intranet` settings 命名空间,其字段命名四个引用(默认与工具包一致);浏览器半注册一个 keyed `settings.plugin.item` 卡片。值只经凭证域写入(`credentials.set`),与 web-search 的 key 完全同型:字面值从不进设置文档或响应,`credentials.describe` 提供已配置/可写徽标,`credentials/updated` 让别处写入的值刷新徽标。卡片自带 chrome 与暂存,因为 bundle 纯净门禁止跨插件导入该分区的共享卡片组件。

**卡片随 intranet bundle 发行**,叠加 `@deepseek-ai/dsh-intranet` 的部署同时获得工具与其配置界面,未叠加的部署无任何痕迹。

## Alternatives considered

**在工具包内建 settings section**(像 bash 卡那样活编辑预算)。本次否决:它把已发行工具包耦合进 settings/UI 关注点,且配置变更要求重注册工具;缺的是凭证界面,不是预算界面。

**面向任意引用的通用凭证浏览器。**否决:没有现实需求方,通用密钥录入界面还会诱发在敲错的名字下粘贴密钥;卡片把录入限定在 section 命名的四个引用。

## Consequences

配置内网工具不再需要编辑文件:卡片录入的值落入凭证存储,下次工具调用即生效,无需重启。section 只存引用名;在工具配置里重命名引用的部署必须在 `intranet` section 声明同名,卡片才寻址正确的键。

## Verification

包测试覆盖:真实 settings provider 上的 Host 半(默认值、配置分层、卸载)、伪 scope/凭证域上的控制器(引用跟随、describe 时序围栏、暂存保存、部分失败保留、跨界面刷新)、四个控件及其动作的 jsdom 渲染,以及槽位条目的 HMR 卸载。端到端路径在运行中的 Web 应用里演练:卡片在插件标签页渲染,保存的值落入 `.credentials.yaml`,徽标翻为已配置。
