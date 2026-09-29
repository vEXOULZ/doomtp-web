import { afterEach, describe, expect, it, vi } from 'vitest'
import { can, isAdmin, manages, mayAddOwn, mayUpgrade, ownBanned, RANK, rankIn, reachesRole } from '../src/lib/access'
import type { Session } from '../src/lib/admin'
import { bounceOnce, refresh } from '../src/lib/session'

/** Signs the app's session in as the bot would answer GET /session. */
async function signIn(s: Partial<Session>) {
  const body: Session = { authenticated: true, csrf: 't', expires_at: null, admin_enabled: false, twitch_login: true, ...s }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })))
  await refresh()
}

const USER = { id: '1', login: 'alice' }
const own = (joined: boolean, tier: string | null = null) => ({ login: 'alice', joined, status: joined ? 'joined' : null, tier })

afterEach(() => vi.unstubAllGlobals())

describe('can', () => {
  it('gives someone who runs no channel their own area, and nothing in any channel', async () => {
    await signIn({ role: 'user', user: USER, channels: [], channel_roles: {}, channel_ranks: {}, own_channel: own(false) })
    expect(can('me')).toBe(true)
    expect(can('explain')).toBe(true)
    expect(can('audit')).toBe(true)
    expect(can('channel.view', 'bob')).toBe(false)
    expect(can('modules.toggle')).toBe(false)
    expect(can('bot')).toBe(false)
    expect(mayAddOwn()).toBe(true)
  })

  it('mirrors chat: a moderator runs the day-to-day, the broadcaster also logging, roles and leaving', async () => {
    await signIn({
      role: 'moderator',
      user: USER,
      channels: ['alice', 'bob'],
      channel_roles: { alice: 'broadcaster', bob: 'moderator' },
      channel_ranks: { alice: 100, bob: 80 },
      own_channel: own(true, 'basic'),
    })
    for (const login of ['alice', 'bob']) {
      expect(can('modules.toggle', login)).toBe(true)
      expect(can('settings.backfill', login)).toBe(true)
      expect(can('runs', login)).toBe(true)
    }
    expect(can('settings.logging', 'alice')).toBe(true)
    expect(can('settings.roles', 'alice')).toBe(true)
    expect(can('channel.part', 'alice')).toBe(true)
    expect(can('settings.logging', 'bob')).toBe(false)
    expect(can('channel.part', 'bob')).toBe(false)
    expect(can('modules.toggle', 'carol')).toBe(false)
    // Without a channel: whether any channel allows it.
    expect(can('settings.roles')).toBe(true)
    expect(can('channel.join')).toBe(false)
    expect(manages('BOB')).toBe(true)
    expect(mayAddOwn()).toBe(false)
    expect(mayUpgrade()).toBe(true)
  })

  it('takes custom roles from the rank the bot reports', async () => {
    await signIn({ role: 'moderator', user: USER, channels: ['bob'], channel_roles: { bob: 'moderator' }, channel_ranks: { bob: 95 } })
    expect(rankIn('bob')).toBe(95)
    expect(can('settings.roles', 'bob')).toBe(false)
  })

  it('reads an older bot that lists only channels as moderator of each', async () => {
    await signIn({ role: 'moderator', user: USER, channels: ['bob'] })
    expect(rankIn('bob')).toBe(RANK.moderator)
    expect(can('channel.part', 'bob')).toBe(false)
    expect(mayAddOwn()).toBe(false)
  })

  it('lets an admin do everything everywhere, as does an older bot that names no role', async () => {
    for (const role of ['admin', undefined] as const) {
      await signIn({ role, user: null, channels: null })
      expect(isAdmin()).toBe(true)
      expect(can('bot')).toBe(true)
      expect(can('channel.part', 'anyone')).toBe(true)
      expect(manages('anyone')).toBe(true)
    }
  })

  it('offers nothing signed out', async () => {
    await signIn({ authenticated: false, csrf: null })
    expect(can('me')).toBe(false)
    expect(manages('bob')).toBe(false)
    expect(isAdmin()).toBe(false)
  })

  it('offers neither the join nor the upgrade to a channel that banned the bot', async () => {
    await signIn({ role: 'user', user: USER, channels: [], own_channel: { login: 'alice', joined: false, status: 'banned', tier: 'basic' } })
    expect(ownBanned()).toBe(true)
    expect(mayAddOwn()).toBe(false)
    expect(mayUpgrade()).toBe(false)
  })

  it('offers the upgrade only below the full tier', async () => {
    await signIn({ role: 'moderator', user: USER, channels: ['alice'], own_channel: own(true, 'full') })
    expect(mayUpgrade()).toBe(false)
  })
})

describe('bounceOnce', () => {
  const storage = () => {
    const kept = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v) })
  }

  it('sends an account-signed-in visitor without a bot session through the sign-in once per tab', async () => {
    await signIn({ authenticated: false, csrf: null })
    storage()
    const go = vi.fn()
    expect(bounceOnce(false, '/', go)).toBe(false)
    expect(bounceOnce(true, '/channels/bob', go)).toBe(true)
    expect(go).toHaveBeenCalledWith('/auth/admin/login?next=%2Fchannels%2Fbob')
    expect(bounceOnce(true, '/', go)).toBe(false)
    expect(go).toHaveBeenCalledOnce()
  })

  it('stays put when already signed in, when the bot has no Twitch sign-in, or without storage', async () => {
    const go = vi.fn()
    await signIn({ role: 'user', user: USER, channels: [] })
    storage()
    expect(bounceOnce(true, '/', go)).toBe(false)
    await signIn({ authenticated: false, csrf: null, twitch_login: false })
    expect(bounceOnce(true, '/', go)).toBe(false)
    await signIn({ authenticated: false, csrf: null })
    vi.stubGlobal('sessionStorage', undefined)
    expect(bounceOnce(true, '/', go)).toBe(false)
    expect(go).not.toHaveBeenCalled()
  })
})

describe('reachesRole', () => {
  const ROLES = [
    { name: 'everyone', rank: 0 },
    { name: 'vip', rank: 60 },
    { name: 'moderator', rank: 80 },
    { name: 'broadcaster', rank: 100 },
  ]

  it("compares the session's rank in the channel with the setting's role", async () => {
    await signIn({ role: 'moderator', user: USER, channels: ['bob'], channel_roles: { bob: 'moderator' }, channel_ranks: { bob: 80 } })
    expect(reachesRole('bob', 'vip', ROLES)).toBe(true)
    expect(reachesRole('bob', 'moderator', ROLES)).toBe(true)
    expect(reachesRole('bob', 'broadcaster', ROLES)).toBe(false)
    expect(reachesRole('carol', 'vip', ROLES)).toBe(false)
  })

  it('treats a role it does not know as moderator, and no role as viewing the channel', async () => {
    await signIn({ role: 'moderator', user: USER, channels: ['bob'], channel_roles: { bob: 'moderator' }, channel_ranks: { bob: 80 } })
    expect(reachesRole('bob', 'editors', ROLES)).toBe(true)
    expect(reachesRole('bob', null, ROLES)).toBe(true)
    expect(reachesRole('carol', undefined, ROLES)).toBe(false)
  })
})
