# @deepseek-ai/dsh-intranet-tool-gitlab

English | [中文](README.zh.md)

The model-facing `intranet_gitlab_analyze_code_source` tool: resolve an intranet GitLab project, discover relevant code from requirement clues, read the bounded effective scope, and return a lightweight impact analysis.

## What it does

Registers one read-only tool on `ctx.tools`. A call names a `projectLocator` (numeric id, final project name, full namespace path, or an intranet GitLab URL on the configured host) plus at least one code path or requirement clue (`moduleHints`, `routeHints`, `apiHints`, `uiTexts`, `changeDescription`). The pipeline runs four ported stages: locator resolution, clue-driven scope discovery (blob searches verified against route/import evidence, compared with user paths), bounded concurrent reading of the effective scope, and per-file static extraction aggregated into API/route/component/service/DTO views with inferred side effects.

Discovery also probes the project's `CLAUDE.md` and the company-convention `docs/agent/模块代码定位指南.md`, applying linked guides as `guidanceFiles`. When no verifiable scope forms, the canonical value carries `analysis: null` plus a warning instead of guessing.

The client, resolver, discoverer, reader, and analyzer are ported from the hydra-agent implementation; the legacy `projectRef`/`projectId` locator fallback is dropped, so resolution always yields full project metadata ([Agent Note](../../../.agents/notes/implemented/feature/2026-08-18-intranet-wiki-tools.md)).

## Credentials

Configuration carries credential reference names (`baseUrlEnv`, `tokenEnv`), never values. Each call resolves them through `ctx.credentials` when that seam is composed and otherwise from the launch environment; a missing or empty value fails the call with remediation guidance naming the unresolved references.

## Configuration

Every field has a default mirroring the hydra-agent production values. `timeoutMs` (60000) is attached as the cooperative `ToolDefinition.timeoutMs` budget; every request forwards `exec.signal`. `hintLimit` (10) caps each clue array. The `discovery` block bounds the clue search: `maxQueries` 6, `searchPerPage` 20, `searchMaxPages` 2, `maxCandidateFiles` 24, `maxDiscoveredPaths` 30. The `read` block bounds acquisition: `maxFiles` 60, `maxFileChars` 50000, `maxTotalChars` 180000, `readConcurrency` 6. Defaults live in module constants the schema and the explicit resolve step share; the analyzer's per-list extraction caps are algorithm internals and stay fixed.

## Rendering

`output.render` returns the canonical value as pretty-printed JSON, matching what the migrated agent's prompts consume. The pending card is generic with `kind: 'search'`, titled with the locator. The tool declares `isConcurrencySafe`.

## Export shape

A function/namespace plugin: it exports `name` / `inject` / `Config` / `apply` and NO default ([postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Model Experience

### Tool schema

#### What the model sees

The generated [`dsh-intranet-tool-gitlab` schema](../../../docs/tool-catalog.md#deepseek-aidsh-intranet-tool-gitlab).

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged.

### Tool-call history and result

#### What the model sees

Each retained call carries its arguments. Success returns the canonical value as pretty-printed JSON: the resolved project with the effective `ref`, the discovery outcome (`status`, evidence, path comparison), the analysis or `null`, and aggregated warnings with a `truncated` flag. Failures are error results: the clue-or-path requirement, locator resolution failures (unknown, ambiguous, truncated search, host mismatch), `'ref' was omitted and the GitLab project has no default branch`, `GitLab <resource> <status>: <body excerpt>` for HTTP failures, and the credential remediation message.

#### Token effect

Conditional per call; results are bounded by the configured discovery and read budgets plus the JSON envelope.

#### KV Cache effect

Append-only: results join the retained transcript and do not rewrite earlier request tokens.

## Known Limitations and Deferred Work

- **Read-only by construction** — the tool issues only GET requests; there is no write surface toward GitLab.
- **Regex-level analysis** — imports, exports, symbols, API calls, and routes come from the ported regex extraction, not a parser; the per-list caps (40/60) bound each file's contribution.
- **Front-end-leaning heuristics** — evidence verification keys on route/module registration patterns and dynamic imports, matching the migrated requirement-review use case.
