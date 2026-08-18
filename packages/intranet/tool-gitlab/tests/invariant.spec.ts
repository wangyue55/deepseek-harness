import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as GitlabInvariant from '../src/invariant.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-intranet-tool-gitlab'

describe('invariant companion', () => {
  it('reserves package ownership while mounted and releases it on dispose', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = await ctx.plugin(GitlabInvariant)
    expect(() => ctx.invariants.register(PACKAGE_NAME, () => {})).toThrow(/already registered/)
    await fiber.dispose()
    const release = ctx.invariants.register(PACKAGE_NAME, () => {})
    release()
  })
})
