import { afterEach, describe, expect, it, vi } from 'vitest'
import { ago } from '../src/lib/admin'
import { ApiError, auth, request } from '../src/lib/api'

describe('ago', () => {
  const now = Date.UTC(2026, 8, 26, 12)
  it('counts seconds, minutes and hours, then gives the date', () => {
    expect(ago(now - 12_000, now)).toBe('12s ago')
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(ago(now - 3 * 86_400_000, now)).toBe('2026-09-23')
  })
  it('shows a dash for nothing and never a negative age', () => {
    expect(ago(null, now)).toBe('—')
    expect(ago(now + 5_000, now)).toBe('0s ago')
  })
})

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

  it('keeps Retry-After on a 429', async () => {
    stub(new Response('{}', { status: 429, headers: { 'retry-after': '30' } }))
    await expect(request('/session', { method: 'POST' })).rejects.toMatchObject({ status: 429, retryAfter: 30 })
  })
})
