// The bot's vex-platform routes (/api/v2: job runs, their events and kinds, the audit log) through the shared client.
// Same rules as every other call (api.ts `auth`): the session's CSRF token on writes, a 401 ends the session, changes
// are refused while an admin views the site as someone else, and reads are narrowed to what that role would get.
import { PlatformClient, ProblemError, type AuditOut } from '@vexoulz/platform-web'
import { auth } from './api'

const BASE = '/api/v2'

async function platformFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const path = input.startsWith(BASE) ? input.slice(BASE.length) : input
  if (method !== 'GET') {
    const blocked = auth.blocks?.()
    if (blocked) {
      return new Response(JSON.stringify({ title: 'Forbidden', status: 403, detail: blocked }), {
        status: 403,
        headers: { 'content-type': 'application/problem+json' },
      })
    }
  }
  const res = await fetch(input, init)
  if (method !== 'GET' || !res.ok || !auth.scope || res.status === 204) return res
  const body: unknown = await res.json()
  return new Response(JSON.stringify(auth.scope(path, body)), { status: res.status, headers: res.headers })
}

export const platform = new PlatformClient({
  base: BASE,
  csrf: () => auth.csrf,
  // A 403 is a refusal, not a session that ended.
  onUnauthorized: (e: ProblemError) => {
    if (e.status === 401) auth.onUnauthorized?.()
  },
  fetch: platformFetch,
  credentials: 'same-origin',
})

/** A backfill job's subject: `channel:<id>`. */
export const channelSubject = (channelId: string) => `channel:${channelId}`

/** Who made a change, when it wasn't a Twitch user: the admin password, a key, or the bot. */
export function nobody(e: AuditOut): string {
  if (e.actor_kind === 'api_key') return `key ${e.actor_id ?? ''}`.trim()
  // The admin password signs in as a user without an id (its login is "session").
  if (e.actor_kind === 'user') return e.actor_id ? (e.actor_login ?? e.actor_id) : 'admin'
  if (e.actor_kind === 'job') return `job ${e.actor_id ?? ''}`.trim()
  return e.via === 'chat' ? 'bot' : 'admin'
}
