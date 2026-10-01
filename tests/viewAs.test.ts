import { afterEach, describe, expect, it, vi } from 'vitest'
import { can, isAdmin, manages, rankIn } from '../src/lib/access'
import type { Session } from '../src/lib/admin'
import { admin } from '../src/lib/admin'
import { ApiError } from '../src/lib/api'
import { previewing, realSession, refresh, session, viewAs } from '../src/lib/session'

async function signIn(s: Partial<Session>) {
  const body: Session = { authenticated: true, csrf: 't', expires_at: null, admin_enabled: true, twitch_login: true, ...s }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })))
  await refresh()
}
const asAdmin = () => signIn({ role: 'admin', user: { id: '9', login: 'vex' } })

afterEach(() => {
  viewAs(null)
  vi.unstubAllGlobals()
})

describe('view as', () => {
  it('shows a moderator of one channel exactly that, while the real session stays admin', async () => {
    await asAdmin()
    viewAs({ role: 'moderator', channel: 'bob', rank: 80 })
    expect(isAdmin()).toBe(false)
    expect(session.channels).toEqual(['bob'])
    expect(rankIn('bob')).toBe(80)
    expect(manages('carol')).toBe(false)
    expect(can('modules.toggle', 'bob')).toBe(true)
    expect(can('settings.logging', 'bob')).toBe(false)
    expect(can('bot')).toBe(false)
    expect(realSession.role).toBe('admin')
    expect(session.user?.login).toBe('vex')
  })

  it('gives a broadcaster their own channel, at its tier', async () => {
    await asAdmin()
    viewAs({ role: 'broadcaster', channel: 'bob', rank: 100, tier: 'basic' })
    expect(session.channelRoles).toEqual({ bob: 'broadcaster' })
    expect(session.ownChannel).toMatchObject({ login: 'bob', joined: true, tier: 'basic' })
    expect(can('channel.part', 'bob')).toBe(true)
  })

  it('places a custom role at its rank: under a moderator it lists no channel', async () => {
    await asAdmin()
    viewAs({ role: 'custom', channel: 'bob', rank: 40, name: 'vip' })
    expect(session.role).toBe('user')
    expect(session.channels).toEqual([])
    expect(rankIn('bob')).toBe(40)
    expect(can('modules.toggle', 'bob')).toBe(false)
    viewAs({ role: 'custom', channel: 'bob', rank: 90, name: 'lead' })
    expect(session.channels).toEqual(['bob'])
    expect(rankIn('bob')).toBe(90)
  })

  it('signs out, for the pages, and a plain user runs nothing', async () => {
    await asAdmin()
    viewAs({ role: 'signed-out', channel: null, rank: 0 })
    expect(session.authenticated).toBe(false)
    expect(session.user).toBeNull()
    expect(realSession.authenticated).toBe(true)
    viewAs({ role: 'user', channel: null, rank: 0 })
    expect(session.authenticated).toBe(true)
    expect(session.channels).toEqual([])
    expect(can('me')).toBe(true)
    expect(can('channel.view', 'bob')).toBe(false)
  })

  it('refuses changes while previewing, but not reads, dry runs or signing out', async () => {
    await asAdmin()
    viewAs({ role: 'moderator', channel: 'bob', rank: 80 })
    const fetch = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(admin.setModule('bob', 'fun', true)).rejects.toThrow(ApiError)
    await expect(admin.setModule('bob', 'fun', true)).rejects.toThrow(/Read-only while viewing as a moderator of #bob/)
    expect(fetch).not.toHaveBeenCalled()
    await admin.channels()
    await admin.explainAs({ text: 'echo hi', channel: 'bob', badges: [], run: false })
    await admin.testFilter('bob', 'hello')
    await admin.logout()
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it("narrows the bot's admin-wide answers to the previewed role's channels", async () => {
    await asAdmin()
    viewAs({ role: 'moderator', channel: 'bob', rank: 80 })
    const reply = (body: unknown) => vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(body))))
    reply({ channels: [{ login: 'bob' }, { login: 'carol' }] })
    expect((await admin.channels()).channels.map((c) => c.login)).toEqual(['bob'])
    expect((await admin.channels(true)).channels.map((c) => c.login)).toEqual(['bob', 'carol'])
    reply({
      items: [
        { id: 1, scope_name: 'bob', actor_kind: 'user', actor_id: '2' },
        { id: 2, scope_name: 'carol', actor_kind: 'user', actor_id: '2' },
        { id: 3, scope_name: null, actor_kind: 'user', actor_id: '9' },
        { id: 4, scope_name: null, actor_kind: 'user', actor_id: '2' },
        { id: 5, scope_name: 'carol', actor_kind: 'user', actor_id: '9' },
      ],
      next_cursor: null,
    })
    expect((await admin.audit(10)).items.map((e) => e.id)).toEqual([1, 3, 5])
    reply({ builtin: [], roles: [], your_rank: 1000 })
    expect((await admin.roles('bob')).your_rank).toBe(80)
  })

  it('is only ever an admin’s: anyone else sees their own session', async () => {
    await signIn({ role: 'moderator', user: { id: '1', login: 'alice' }, channels: ['alice'], channel_roles: { alice: 'broadcaster' }, channel_ranks: { alice: 100 } })
    viewAs({ role: 'signed-out', channel: null, rank: 0 })
    expect(previewing()).toBeNull()
    expect(session.authenticated).toBe(true)
  })
})
