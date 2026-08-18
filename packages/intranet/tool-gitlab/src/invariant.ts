/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-intranet-tool-gitlab`.
 * @module @deepseek-ai/dsh-intranet-tool-gitlab/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-intranet-tool-gitlab'
/** Cordis companion plugin name. */
export const name = 'intranet-tool-gitlab-invariant'
/** Services required before package ownership can be reserved. */
export const inject = ['invariants']
/**
 * No runtime invariant: the package appends no session events, and its tool
 * output is validated against its declared schema by the tool registry.
 */
const install: InvariantInstaller = () => {}
/**
 * Register the package invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
