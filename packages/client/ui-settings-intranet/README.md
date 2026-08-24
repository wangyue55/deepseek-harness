# @deepseek-ai/dsh-client-ui-settings-intranet

English | [中文](README.zh.md)

The intranet credentials card: one entry in the Plugins settings tab that shows whether the wiki and GitLab references are configured and stores new values through the credentials domain.

## What it does

The Host half registers the `intranet` settings namespace whose four fields name the credential references the card addresses (`wikiBaseUrlEnv`, `wikiTokenEnv`, `gitlabBaseUrlEnv`, `gitlabTokenEnv`, defaulting to the `INTRANET_*` names the tool packages also default to). The browser half registers one keyed `settings.plugin.item` card: each control shows the addressed reference and its configured/writable state from `credentials.describe`, stages drafts locally, and one save writes them through `credentials.set` — values land in the credentials store, never in settings documents or responses. A `credentials/reference-updated` event for a watched reference re-reads its badge, so a value written on another surface stays truthful here.

A deployment that renames a reference in a tool config states the same name in this section (composition config or the card's own settings layer) so the card edits the right key.

## Packaging

A two-half plugin: the Host half under `src/`, the browser half under `src/client/` served as the built `./client` bundle through the client module system when a `cordis.yml` mounts the package. The [`dsh-intranet`](../../bundle/intranet/README.md) bundle mounts it beside the tools; the card renders only where the Host serves the `intranet` namespace.

## Model Experience

Indirectly, through `dsh-intranet-tool-wiki` and `dsh-intranet-tool-gitlab`, whose calls resolve the credentials this card stores; the card itself contributes no model-visible text.

#### KV Cache effect

No direct invalidation; the tool packages own their schema-prefix effects.

## Known Limitations and Deferred Work

- **No unset control** — the card writes values but offers no clear-back-to-unconfigured action; remove a stored value by editing `.credentials.yaml`.
- **Source launch needs two resolution paths** — the Host half resolves through the `tsconfig.base.json` paths entry (`verify-cordis-config` enforces it), while the browser bundle is discovered by Node resolution from the profile, so a source-launch developer symlinks this package into `$DSH_HOME/profiles/node_modules`; production installs via `dsh plugin add` resolve from the profile's own modules.
