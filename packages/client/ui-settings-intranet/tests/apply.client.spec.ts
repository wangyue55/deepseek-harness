/** What the browser half registers, and that it all leaves with the fiber. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-settings-intranet/client'
import type { IntranetCardFace } from '@deepseek-ai/dsh-client-ui-settings-intranet/client'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const describeCredentials = vi.fn(() => Promise.resolve({
    rpcId: 'c',
    result: {
      ok: true,
      value: { credentials: { INTRANET_WIKI_TOKEN: { configured: true, writable: true } } },
    },
  }))
  const setCredential = vi.fn(() => Promise.resolve({ rpcId: 'w', result: { ok: true, value: {} } }))
  const describeSettings = vi.fn(() => Promise.resolve({ rpcId: 's', result: { ok: false, error: {} } }))
  new TestRemote(ctx)
  ctx.provide('connection', {
    isLoopback: true,
    api: {
      settings: { describe: describeSettings },
      credentials: { describe: describeCredentials, set: setCredential },
    },
  } as never)
  await ctx.plugin(SettingsScopeBinder).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, describeCredentials, setCredential }
}

function declareItemSlot(slots: SlotRegistry): void {
  slots.register({
    name: 'root',
    children: { 'settings.plugin.item': { kind: 'keyed', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-intranet apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope'])
  })

  it('registers the intranet card with Chinese copy and a live face', async () => {
    const { ctx, slots, describeCredentials } = await bench()
    declareItemSlot(slots)

    await ctx.plugin({ inject: [...inject], apply }).await()

    const entry = slots.entries('settings.plugin.item')[0]
    expect(entry?.options).toMatchObject({ key: 'intranet' })
    const face = ((entry as { inject?: () => unknown }).inject as () => IntranetCardFace)()
    const state = face.hooks.intranetCard.getSnapshot()
    expect(Object.keys(state.fields)).toEqual(['wikiBaseUrl', 'wikiToken', 'gitlabBaseUrl', 'gitlabToken'])
    expect(describeCredentials).toHaveBeenCalled()
    const locale = ctx.get('locale') as LocaleRuntime
    const t = locale.bind('settings.intranet' as never)
    expect(t('title' as never)).toBe('内网工具')
  })

  it('writes staged drafts through the credentials domain', async () => {
    const { ctx, slots, setCredential } = await bench()
    declareItemSlot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = slots.entries('settings.plugin.item')[0]
    const face = ((entry as { inject?: () => unknown }).inject as () => IntranetCardFace)()
    face.edit('gitlabToken', 'glpat-secret')
    await face.save()
    expect(setCredential).toHaveBeenCalledWith({ ref: 'INTRANET_GITLAB_TOKEN', value: 'glpat-secret' })
  })

  it('re-reads a watched credential when the Host reports it changed', async () => {
    const { ctx, slots, describeCredentials } = await bench()
    declareItemSlot(slots)
    await ctx.plugin({ inject: [...inject], apply }).await()
    await Promise.resolve()
    const calls = describeCredentials.mock.calls.length
    ;(ctx as unknown as { remote: { $dispatch(event: string, args: unknown[]): void } })
      .remote.$dispatch('credentials/updated', ['INTRANET_WIKI_TOKEN'])
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(describeCredentials.mock.calls.length).toBeGreaterThan(calls)
  })

  it('unregisters the card and its dictionaries with the fiber (HMR safety)', async () => {
    const { ctx, slots } = await bench()
    declareItemSlot(slots)
    const fiber = await ctx.plugin({ inject: [...inject], apply }).await()
    expect(slots.entries('settings.plugin.item')).toHaveLength(1)
    await fiber.dispose()
    expect(slots.entries('settings.plugin.item')).toHaveLength(0)
  })
})
