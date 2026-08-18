# Agent Note: Intranet wiki tools migrated from hydra-agent

Status: implemented

English | [中文](2026-08-18-intranet-wiki-tools.zh.md)

## Problem

The hydra-agent project ships three production intranet wiki tools (`internal_wiki_read_page`, `internal_wiki_prepare_write`, `internal_wiki_apply_write`) over a Confluence-style REST API. Migrating them into dsh means mapping hydra's tool-local metadata — `riskLevel`-driven human approval, per-tool timeouts, result-size caps, env-var credentials, and availability hiding — onto dsh's plugin, policy, credential, and presentation surfaces without inventing new mechanisms.

## Decision

**One Consumer package, no capability seam.** `@deepseek-ai/dsh-intranet-tool-wiki` (`packages/intranet/tool-wiki`) registers the three tools, renamed `intranet_wiki_*`, and owns its HTTP client and converters as package-internal modules. There is one backend (the company Confluence-style API) and one Consumer, so a Service Definition / Provider / Consumer split has no independently evolving role to justify it; other in-process consumers reach the tools through Code Mode. Split the seam if a second wiki backend or a non-tool consumer appears.

**Hydra metadata maps onto existing dsh surfaces**, not new ones:

- `riskLevel: high` + HITL → a `tools/pre-execute` listener in this package returning `{ kind: 'ask' }` for `intranet_wiki_apply_write` under the required `applyWriteApproval: 'ask'` config; `ctx.approval` services the ask and its absence fails closed. The pending card carries the full `contentMarkdown` so an approver reviews the exact write.
- `timeout` → `ToolDefinition.timeoutMs` from `readTimeoutMs`/`writeTimeoutMs` config, enforced by the base-mounted timeout policy; every fetch forwards `exec.signal`, which hydra never did.
- `maxResultSize` → the in-tool acquisition budgets became the `read` config block; generic result pruning stays with the composed pruner.
- env credentials → config carries credential reference names resolved per call through `ctx.credentials` with a launch-environment fallback (the `web-search-deepseek` pattern).
- `isAvailable()` (silent hiding without credentials) → deliberately dropped: composition decides mounting, and a mounted tool with unresolved references fails loud with remediation. A deployment without the wiki simply does not stack the intranet bundle.
- `concurrencySafe` → `isConcurrencySafe()` on the reads and the prepare step; the apply step keeps the registry's exclusive default.

**Faithful port with contract-level changes only.** The client, HTML-to-text, and Markdown-to-storage converters are line-level ports (signal threading and typed JSON narrowing added). String returns became canonical values under declared output schemas: the two hydra read shapes merged into one page-list shape, `ok:false` version conflicts became the domain outcome `status: 'version_conflict'`, and `"Error: ..."` strings became thrown errors. `output.render` stays pretty-printed JSON of the canonical value, matching what the migrated prompts consume. Diagnostics moved to English; the `AI 补充内容` fallback heading stays Chinese because it is written into wiki pages.

## Alternatives considered

**A wiki capability seam now.** Rejected: no current second provider or non-tool consumer; the pre-release stance makes a later split cheap.

**Maintained converter dependencies instead of the ported code.** Deferred to keep the migration faithful to tested behavior. Candidates recorded: `html-to-text` (npm) for the HTML-to-text pass; a maintained Markdown renderer targeting Confluence storage format for `markdownToWikiStorage`; both would delete owned code and tests if adopted, per the dependencies-over-hand-rolling policy.

**Structured prose rendering instead of JSON.** Deferred: the migrated prompts and skills consume the JSON layout; a Native prose renderer is a compatible later change because the canonical value is already the programmatic API.

**Keeping the `internal_wiki_*` names.** Rejected by the migration owner in favor of `intranet_*`, matching the group, bundle, and default credential reference naming (`INTRANET_WIKI_BASE_URL` / `INTRANET_WIKI_TOKEN`).

## Consequences

The tools behave differently from hydra in four observable ways: a mounted plugin with unresolved credential references errors per call instead of hiding the tools; cancellation and timeouts actually stop in-flight HTTP work; the read tool returns one page-list shape in both scopes; and apply-write approval is a composition policy, so automation compositions without an approval seam get a closed-by-default write tool. Deployments own the budgets and timeouts as config; the schema descriptions interpolate them, so changing budgets churns the request prefix.

## Verification

Package tests cover the client over an injected `fetchFn`, the tools over a real `ToolRuntime` against a loopback Confluence-style stub (including ask-fails-closed, version conflict, cancellation, and budget boundaries), a real Loader composition proving fail-loud config and the composed allow write, and credentials-seam resolution through `dsh-credentials-local`. Real-API smokes self-skip without `INTRANET_WIKI_*` and gate the only live write behind `INTRANET_WIKI_E2E_PARENT_PAGE`. The keyless ACP snapshot scenario exercises read → prepare → approval-gated apply against the fixture server.
