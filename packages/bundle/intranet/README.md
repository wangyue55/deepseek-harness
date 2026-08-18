# @deepseek-ai/dsh-intranet

English | [中文](README.zh.md)

Company-intranet tools as a profile bundle: one patch layer inserting the [`dsh-intranet-tool-wiki`](../../intranet/tool-wiki/README.md) and [`dsh-intranet-tool-gitlab`](../../intranet/tool-gitlab/README.md) rows over `dsh-base`.

## What the patch mounts

Three rows: the three wiki tools under `applyWriteApproval: ask` — every `intranet_wiki_apply_write` call routes through the approval seam and fails closed without one — the read-only GitLab analysis tool under its defaults, and the [credentials card](../../client/ui-settings-intranet/README.md), which puts the four references on the web settings page. The bundle carries no credential values: both packages default their references to `INTRANET_WIKI_BASE_URL` / `INTRANET_WIKI_TOKEN` and `INTRANET_GITLAB_BASE_URL` / `INTRANET_GITLAB_TOKEN`, resolved per call through the credentials service or the launching environment.

## Using it

Add the bundle to a profile's stacked list ([profile contract](../../boot/app-boot/README.md#profiles)), or install it out of tree with `dsh plugin --profile <name> add @deepseek-ai/dsh-intranet`. Export the four reference values (or store them through the credentials service) before calling the tools; a call without them fails with remediation guidance. During development, `pnpm dsh web --patch packages/bundle/intranet/cordis.patch.yml` mounts the same rows over the web profile.

## Model Experience

Indirectly, through `dsh-intranet-tool-wiki` and `dsh-intranet-tool-gitlab`, whose schemas and results this patch layer mounts; the bundle itself contributes no model-visible text.

#### KV Cache effect

No direct invalidation; the mounted tool packages own their schema-prefix effects.

## Known Limitations and Deferred Work

- **No shipped profile stacks this bundle** — deployments opt in per profile; there is no intranet profile template yet.
