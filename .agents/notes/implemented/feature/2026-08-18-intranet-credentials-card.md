# Agent Note: Intranet credentials settings card

Status: implemented

English | [中文](2026-08-18-intranet-credentials-card.zh.md)

## Problem

The intranet tools resolve four credential references per call, but the product offered no surface to enter the values: deployments edited `.env` or `.credentials.yaml` by hand. The wiki write path already fails loud with remediation, yet a settings-page control is the discoverable place to configure a mounted capability.

## Decision

**One two-half plugin, `@deepseek-ai/dsh-client-ui-settings-intranet`, following the settings-card cookbook.** The Host half serves the `intranet` settings namespace whose fields name the four references (defaults matching the tool packages); the browser half registers one keyed `settings.plugin.item` card. Values are written only through the credentials domain (`credentials.set`), exactly like the web-search key: a literal never enters settings documents or responses, `credentials.describe` supplies the configured/writable badges, and `credentials/updated` re-reads a badge written from another surface. The card owns its own chrome and staging because the bundle-purity gate forbids importing the section's shared card components across plugins.

**The card ships through the intranet bundle**, so a deployment that stacks `@deepseek-ai/dsh-intranet` gets the tools and their configuration surface together, and one without it shows no trace.

## Alternatives considered

**Settings sections inside the tool packages** (live-editable budgets like the bash card). Rejected for this change: it couples the shipped tool packages to settings/UI concerns and requires re-registering tools on config change; the credentials were the missing surface, not the budgets.

**A generic credentials browser for arbitrary references.** Rejected: no owner asked for it, and a generic secret-entry surface invites pasting keys under mistyped names; the card scopes entry to the four references the section names.

## Consequences

Configuring the intranet tools no longer requires file edits: values entered on the card land in the credentials store and take effect on the next tool call without a restart. The section stores only reference names; a deployment that renames a reference in a tool config must state the same name in the `intranet` section for the card to address the right key.

## Verification

Package tests cover the Host half over a real settings provider (defaults, config layering, disposal), the controller over fake scope/credentials fakes (reference following, describe fencing, staged saves, partial-failure retention, cross-surface refresh), jsdom rendering of the four controls and their actions, and HMR disposal of the slot entry. The end-to-end path was exercised in the running web app: the card rendered in the Plugins tab, a saved value landed in `.credentials.yaml`, and the badge flipped to configured.
