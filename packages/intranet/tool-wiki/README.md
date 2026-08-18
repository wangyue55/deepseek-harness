# @deepseek-ai/dsh-intranet-tool-wiki

English | [中文](README.zh.md)

Model-facing intranet wiki tools over a Confluence-style REST endpoint: bounded page reading plus a two-step write-back whose apply step routes through the approval seam.

## What it does

Registers three tools on `ctx.tools`:

- `intranet_wiki_read_page` — reads one page by URL or page id, or (only on explicit request) the page and its descendants breadth-first, converting storage HTML to plain text under depth, page-count, per-page, and whole-call character budgets. The canonical value is one page list (the root first) with `completeness` reporting `complete`, `partial_tree`, `partial_access`, or `partial_content`.
- `intranet_wiki_prepare_write` — the read-only first step of a write-back: validates the target, renders the Markdown to storage format, and returns the plan (target page, effective title, `baseVersion` for appends, full `contentMarkdown`, and a heading summary) without changing the wiki.
- `intranet_wiki_apply_write` — the write itself: `create_child` creates a child page under a parent, `append_page` appends below a heading at the next version. A `baseVersion` that no longer matches returns the domain outcome `status: 'version_conflict'` instead of writing; infrastructure failures throw.

The wiki endpoint is a company Confluence-style REST API; the client, HTML-to-text, and Markdown-to-storage converters are ported from the hydra-agent implementation ([Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.md)).

## Approval policy

`applyWriteApproval` is required: every composition must choose how `intranet_wiki_apply_write` executes. Under `ask` the plugin registers a `tools/pre-execute` listener returning `{ kind: 'ask' }` for exactly that tool, so every call routes through `ctx.approval` and fails closed when no approval seam or owning agent is composed. Under `allow` the call executes directly. The pending card carries the full `contentMarkdown` in its raw input, so an approver sees exactly what would be written.

## Credentials

Configuration carries credential reference names (`baseUrlEnv`, `tokenEnv`), never values. Each call resolves them through `ctx.credentials` when that seam is composed and otherwise from the launch environment; a missing or empty value fails the call with remediation guidance naming the unresolved references.

## Configuration

Only `applyWriteApproval` has no default. `readTimeoutMs` (60000) and `writeTimeoutMs` (30000) are attached as cooperative `ToolDefinition.timeoutMs` budgets, enforced by the composed timeout policy; every fetch forwards `exec.signal`, so cancellation and timeouts stop in-flight requests. The `read` block holds the model-visible budgets and their clamps: `defaultMaxChars` 60000 (cap `maxChars` 100000), `totalMaxChars` 150000, `maxDepth` 10, `defaultMaxPages` 30 (cap `maxPages` 100), `defaultMaxCharsPerPage` 20000 (cap `maxCharsPerPage` 60000). Defaults mirror the migrated hydra-agent production values and live in module constants the schema and the explicit resolve step share.

## Validation

Beyond schema checks, `execute` enforces the cross-field rules: a read needs `url` or `pageId` (descendants scope needs a resolvable page id), `create_child` needs `parentPageId` and `title`, `append_page` needs `pageId` or `targetWikiUrl`, and `contentMarkdown` must be non-empty after trimming. Model-supplied budgets are clamped into the configured windows.

## Rendering

`output.render` returns the canonical value as pretty-printed JSON for all three tools, matching what the migrated agent's prompts consume. Pending cards are generic: reads use `kind: 'read'` titled with the target page, the apply step uses `kind: 'edit'` titled with the action and target. Reads and prepares declare `isConcurrencySafe`; the apply step stays exclusive.

## Export shape

A function/namespace plugin: it exports `name` / `inject` / `Config` / `apply` and NO default ([postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Model Experience

### Tool schemas

#### What the model sees

The generated [`dsh-intranet-tool-wiki` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-intranet-tool-wiki). Budget parameter descriptions interpolate the configured defaults and caps.

#### Token effect

Fixed schema cost for the three tools on every request where they are visible.

#### KV Cache effect

Prefix-stable while the definitions and visibility are unchanged; changing the configured budgets or timeouts changes the interpolated descriptions and invalidates reuse from the schemas.

### Tool-call history and result

#### What the model sees

Each retained call carries its arguments (an apply call retains the full `contentMarkdown`). Success returns the canonical value as pretty-printed JSON; an out-of-date `baseVersion` returns the `version_conflict` value with the current version and a re-prepare instruction. Failures are error results: the cross-field validation messages above, `Wiki API <status>: <body excerpt>` for HTTP failures, the credential remediation message, and — under `ask` with no approval channel — the gate reason `This call writes to the intranet wiki.`

#### Token effect

Conditional per call; read results are bounded by the configured character budgets plus the JSON envelope.

#### KV Cache effect

Append-only: results join the retained transcript and do not rewrite earlier request tokens.

## Known Limitations and Deferred Work

- **No automated live write coverage** — the real-API smoke reads and prepares only; `create_child` against the real wiki runs solely when `INTRANET_WIKI_E2E_PARENT_PAGE` names a sandbox parent, so routine e2e runs never mutate the wiki.
- **First-version write actions only** — `create_child` and `append_page`; replacing or editing existing page content is not supported, matching the migrated implementation.
- **Hand-rolled converters** — HTML-to-text and Markdown-to-storage are the ported hydra implementations; maintained-dependency replacements are recorded as candidates in the [migration Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.md).
