import { afterEach, describe, expect, it, vi } from 'vitest'
import { admin, readIgnored } from '../src/lib/admin'
import { ApiError, auth, request } from '../src/lib/api'

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    auth.csrf = null
    auth.onUnauthorized = null
  })
  const stub = (response: Response) => {
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('sends the CSRF token on writes only', async () => {
    auth.csrf = 'tok'
    const fetch = stub(new Response(null, { status: 204 }))
    await request('/keys/1', { method: 'DELETE' })
    await request('/keys')
    expect((fetch.mock.calls[0]![1].headers as Headers).get('X-CSRF-Token')).toBe('tok')
    expect((fetch.mock.calls[1]![1].headers as Headers).get('X-CSRF-Token')).toBeNull()
  })

  it('joins validation messages and reports a 401', async () => {
    const onUnauthorized = vi.fn()
    auth.onUnauthorized = onUnauthorized
    stub(new Response(JSON.stringify({ detail: [{ msg: 'too long' }, { msg: 'bad zone' }] }), { status: 422 }))
    await expect(request('/channels/x', { method: 'PATCH' })).rejects.toThrow('too long; bad zone')
    stub(new Response(JSON.stringify({ detail: 'not signed in' }), { status: 401 }))
    await expect(request('/keys')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it("reads the audit from /api/v2, and a problem's detail when it fails", async () => {
    const fetch = stub(new Response(JSON.stringify({ items: [], next_cursor: null })))
    expect(await admin.audit(20, { scope: '123', actor: 'me', action: '', cursor: 'abc' })).toEqual({ items: [], next_cursor: null })
    expect(fetch.mock.calls[0]![0]).toBe('/api/v2/audit?limit=20&scope=123&actor=me&cursor=abc')
    stub(
      new Response(JSON.stringify({ title: 'Bad Request', status: 400, detail: 'bad cursor', code: 'bad_cursor' }), {
        status: 400,
        headers: { 'content-type': 'application/problem+json' },
      }),
    )
    await expect(admin.audit(20, { cursor: 'x' })).rejects.toThrow('bad cursor')
  })

  it('keeps Retry-After on a 429', async () => {
    stub(new Response('{}', { status: 429, headers: { 'retry-after': '30' } }))
    await expect(request('/session', { method: 'POST' })).rejects.toMatchObject({ status: 429, retryAfter: 30 })
  })
})

describe('readIgnored', () => {
  it('reads bare ids from older bots', () => {
    expect(readIgnored('2002', false)).toMatchObject({ userId: '2002', login: null, addedBy: null, self: false })
  })
  it('marks an ignore someone set on themselves', () => {
    const entry = { user_id: '2001', login: 'alice', reason: null, added_by: '2001', added_by_login: 'alice', added_at: 1 }
    expect(readIgnored(entry, true)).toMatchObject({ login: 'alice', self: true, everywhere: true })
    expect(readIgnored({ ...entry, added_by: '1001' }, false).self).toBe(false)
  })
})

describe('Twitch sign-in', () => {
  it('starts at the bot with the page to come back to, and explains every failure the callback reports', async () => {
    const { SIGNIN_ERRORS, twitchLoginUrl } = await import('../src/lib/session')
    expect(twitchLoginUrl('/admin/channels/vexoulz')).toBe('/auth/admin/login?next=%2Fadmin%2Fchannels%2Fvexoulz')
    expect(Object.keys(SIGNIN_ERRORS).sort()).toEqual(['denied', 'expired', 'no_channels', 'not_configured', 'twitch'])
  })
})

describe('admin.log', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('repeats kinds and leaves out empty filters', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], next_cursor: null })))
    vi.stubGlobal('fetch', fetch)
    await admin.log('bob', { q: 'hi there', user: '', kind: ['message', 'moderation'], hide_removed: false, cursor: undefined, limit: 100 })
    const url = new URL(String(fetch.mock.calls[0]![0]), 'http://x')
    expect(url.pathname).toBe('/api/v2/channels/bob/log')
    expect(url.searchParams.getAll('kind')).toEqual(['message', 'moderation'])
    expect(url.searchParams.get('q')).toBe('hi there')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(['user', 'hide_removed', 'cursor'].filter((k) => url.searchParams.has(k))).toEqual([])
  })
})
