/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-settings-intranet`.
 * @module @deepseek-ai/dsh-client-ui-settings-intranet/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-settings-intranet'
/** Cordis companion plugin name. */
export const name = 'ui-settings-intranet-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']
/**
 * No runtime invariant: the package registers one settings section and one
 * browser card; credential state lives in the Host's credentials service,
 * which owns its own checks.
 */
const install: InvariantInstaller = () => {}
/**
 * Register the package invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
