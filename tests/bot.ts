// A stand-in for the bot's API in tests: GET /roles as the bot ranks chat's roles, GET /session as given (and, with
// X-View-As, the preview's session), and anything else as `other` answers it.
import { vi } from 'vitest'
import type { Session } from '../src/lib/admin'

export const ROLES = {
  roles: [
    { name: 'everyone', rank: 0 },
    { name: 'moderator', rank: 80 },
    { name: 'broadcaster', rank: 100 },
    { name: 'bot_admin', rank: 1000 },
  ],
  custom_rank_range: [1, 99],
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

export function stubBot(
  session: Session,
  previews: Record<string, Session | number> = {},
  other: (url: string, init: RequestInit) => Response = () => json({}),
) {
  const fetch = vi.fn(async (input: string, init: RequestInit = {}) => {
    // v1's paths as the bot names them; /api/v2's whole.
    const url = String(input).replace(/^\/api\/v1(?=\/)/, '')
    const viewAs = new Headers(init.headers).get('X-View-As')
    if (url === '/roles') return json(ROLES)
    if (url === '/session' && !init.method) {
      if (!viewAs) return json(session)
      const p = previews[viewAs] ?? 400
      return typeof p === 'number' ? json({ detail: `can't preview ${viewAs}` }, p) : json({ ...p, view_as: viewAs })
    }
    return other(url, init)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
