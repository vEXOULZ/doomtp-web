// The bot's vex-platform routes (/api/v2: job runs, their events and kinds, the audit log) through the shared client.
// Same rules as every other call (api.ts `auth`): the session's CSRF token on writes, the preview's X-View-As while an
// admin views the site as someone else (the bot scopes the answer and refuses changes), and a 401 ends the session.
import { PlatformClient, type AuditOut } from '@vexoulz/platform-web'
import { auth, previewHeader, sessionEnded } from './api'

async function platformFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  previewHeader(headers)
  const res = await fetch(input, { ...init, headers })
  if (sessionEnded(res)) auth.onUnauthorized?.()
  return res
}

export const platform = new PlatformClient({
  base: '/api/v2',
  csrf: () => auth.csrf,
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
