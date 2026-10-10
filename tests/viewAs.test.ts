import { afterEach, describe, expect, it, vi } from 'vitest'
import { can, isAdmin, manages, rankIn } from '../src/lib/access'
import { admin, type Session } from '../src/lib/admin'
import { platform } from '../src/lib/platform'
import { previewing, realSession, refresh, session, viewAs } from '../src/lib/session'
import { stubBot } from './bot'

const base = { authenticated: true, csrf: 't', expires_at: null, admin_enabled: true, twitch_login: true }
const ADMIN: Session = { ...base, role: 'admin', user: { id: '9', login: 'vex' } }
// The sessions the bot gives for each X-View-As (ADR-0030).
const PREVIEWS: Record<string, Session | number> = {
  'signed-out': { ...base, authenticated: false, csrf: null, user: null, channels: null },
  user: { ...base, role: 'user', user: ADMIN.user, channels: [], channel_roles: {}, channel_ranks: {} },
  'moderator@bob': { ...base, role: 'moderator', user: ADMIN.user, channels: ['bob'], channel_roles: { bob: 'moderator' }, channel_ranks: { bob: 80 } },
  'broadcaster@bob': {
    ...base,
    role: 'moderator',
    user: ADMIN.user,
    channels: ['bob'],
    channel_roles: { bob: 'broadcaster' },
    channel_ranks: { bob: 100 },
    own_channel: { login: 'bob', joined: true, status: 'joined', tier: 'basic' },
  },
  '40@bob': { ...base, role: 'user', user: ADMIN.user, channels: [], channel_roles: {}, channel_ranks: { bob: 40 } },
  'moderator@nobody': 400,
}

type Fetch = ReturnType<typeof stubBot>
async function asAdmin(other?: Parameters<typeof stubBot>[2]): Promise<Fetch> {
  const fetch = stubBot(ADMIN, PREVIEWS, other)
  await refresh()
  return fetch
}
/** The X-View-As each call to `url` carried. */
const sent = (fetch: Fetch, url: string) =>
  fetch.mock.calls.filter(([u]) => String(u).replace(/^\/api\/v1(?=\/)/, '').split('?')[0] === url).map(([, init]) => new Headers(init?.headers).get('X-View-As'))

afterEach(async () => {
  await viewAs(null)
  vi.unstubAllGlobals()
})

describe('view as', () => {
  it('shows the session the bot gives for the preview, while the real session stays admin', async () => {
    await asAdmin()
    await viewAs({ role: 'moderator', channel: 'bob' })
    expect(isAdmin()).toBe(false)
    expect(session.channels).toEqual(['bob'])
    expect(rankIn('bob')).toBe(80)
    expect(manages('carol')).toBe(false)
    expect(can('modules.toggle', 'bob')).toBe(true)
    expect(can('settings.logging', 'bob')).toBe(false)
    expect(can('bot')).toBe(false)
    expect(realSession.role).toBe('admin')
  })

  it("gives a broadcaster the bot's own-channel answer", async () => {
    await asAdmin()
    await viewAs({ role: 'broadcaster', channel: 'bob' })
    expect(session.channelRoles).toEqual({ bob: 'broadcaster' })
    expect(session.ownChannel).toMatchObject({ login: 'bob', tier: 'basic' })
    expect(can('channel.part', 'bob')).toBe(true)
  })

  it('previews a custom role by its rank', async () => {
    const fetch = await asAdmin()
    await viewAs({ role: 'custom', channel: 'bob', rank: 40, name: 'vip' })
    expect(sent(fetch, '/session').at(-1)).toBe('40@bob')
    expect(session.role).toBe('user')
    expect(rankIn('bob')).toBe(40)
    expect(can('modules.toggle', 'bob')).toBe(false)
  })

  it('signs out, for the pages, and a plain user runs nothing', async () => {
    await asAdmin()
    await viewAs({ role: 'signed-out', channel: null })
    expect(session.authenticated).toBe(false)
    expect(session.user).toBeNull()
    expect(realSession.authenticated).toBe(true)
    await viewAs({ role: 'user', channel: null })
    expect(session.authenticated).toBe(true)
    expect(session.channels).toEqual([])
    expect(can('me')).toBe(true)
    expect(can('channel.view', 'bob')).toBe(false)
  })

  it('keeps the current preview when the bot refuses a new one', async () => {
    await asAdmin()
    await viewAs({ role: 'moderator', channel: 'bob' })
    await expect(viewAs({ role: 'moderator', channel: 'nobody' })).rejects.toThrow(/can't preview/)
    expect(previewing()).toEqual({ role: 'moderator', channel: 'bob' })
  })

  it('sends X-View-As on every call, v2 too, but not on the picker reads or signing out; the bot refuses writes', async () => {
    const fetch = await asAdmin((_url, init) =>
      init.method === 'PUT'
        ? new Response(JSON.stringify({ detail: 'Read-only while viewing as someone else.' }), { status: 403 })
        : new Response(JSON.stringify({ channels: [], items: [], next_cursor: null })),
    )
    await viewAs({ role: 'moderator', channel: 'bob' })
    await admin.channels()
    await platform.audit({ limit: 10 })
    await expect(admin.setModule('bob', 'fun', true)).rejects.toThrow('Read-only while viewing as someone else.')
    await admin.channels(true)
    await admin.logout()
    expect(sent(fetch, '/channels')).toEqual(['moderator@bob', null])
    expect(sent(fetch, '/api/v2/audit')).toEqual(['moderator@bob'])
    expect(sent(fetch, '/channels/bob/modules/fun')).toEqual(['moderator@bob'])
    expect(sent(fetch, '/session').at(-1)).toBeNull()
  })

  it("doesn't end the session on a signed-out preview's 401", async () => {
    await asAdmin(() => new Response('{}', { status: 401, headers: { 'X-View-As': 'signed-out' } }))
    await viewAs({ role: 'signed-out', channel: null })
    await expect(admin.keys()).rejects.toMatchObject({ status: 401 })
    expect(realSession.authenticated).toBe(true)
    expect(previewing()).toEqual({ role: 'signed-out', channel: null })
  })

  it('is only ever an admin’s: anyone else sees their own session', async () => {
    stubBot(
      { ...base, role: 'moderator', user: { id: '1', login: 'alice' }, channels: ['alice'], channel_roles: { alice: 'broadcaster' }, channel_ranks: { alice: 100 } },
      { 'signed-out': 403 },
    )
    await refresh()
    await viewAs({ role: 'signed-out', channel: null }).catch(() => {})
    expect(previewing()).toBeNull()
    expect(session.authenticated).toBe(true)
  })
})
