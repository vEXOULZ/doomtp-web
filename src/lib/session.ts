// The bot session: one reactive session for the whole app. DtpShell loads it on every page, so the Manage bar
// shows as soon as someone is signed in; the router guard awaits it on /manage pages. A 401 from any call made with
// the session drops it, and the next step lands on the sign-in page.
import { reactive, readonly } from 'vue'
import { admin, type AuditEntry, type Channel, type ChannelRoles, type OwnChannel, type Session, type SessionRole } from './admin'
import { auth } from './api'
import { describe, loadPreview, savePreview, type Preview } from './viewAs'

const state = reactive({
  checked: false,
  authenticated: false,
  /** False when the password login isn't offered here: none is set, or this visitor is off its networks. */
  enabled: true,
  /** Whether the bot offers signing in with Twitch. */
  twitchLogin: false,
  expiresAt: null as number | null,
  /** What the session may do (see access.ts); an older bot doesn't say, which means admin. */
  role: null as SessionRole | null,
  /** The signed-in Twitch user; null for the admin password. */
  user: null as { id: string; login: string } | null,
  /** The channels the session manages; null means every channel (an admin). */
  channels: null as string[] | null,
  /** Why it manages each one, and its chat rank there (custom roles included). Null for an admin. */
  channelRoles: null as Record<string, 'broadcaster' | 'moderator'> | null,
  channelRanks: null as Record<string, number> | null,
  /** The user's own channel, for the "add the bot" and "upgrade" buttons. */
  ownChannel: null as OwnChannel | null,
  /** Why the visitor was sent to the sign-in page (an expired session). */
  notice: null as string | null,
})
/** The session as the bot gave it. Signing in and out, the router guard and the account menu go by this one. */
export const realSession = readonly(state)

// ── view as (admins) ──
// An admin can preview the site as another role (lib/viewAs.ts). The pages read `session`, which then reports that
// role; the bot still treats the admin as an admin, so every change is refused here while previewing.
const preview = reactive({ as: loadPreview() })
const realAdmin = () => state.authenticated && (state.role === 'admin' || state.role === null)
/** Whether the real session may preview other roles. */
export const mayViewAs = realAdmin
/** What the site is previewed as, or null (never for anyone but an admin). */
export const previewing = (): Preview | null => (realAdmin() ? preview.as : null)
/** Changes with every preview, so the pages can load again as the new role (App.vue keys the page on it). */
export const previewKey = () => JSON.stringify(previewing())
export function viewAs(p: Preview | null) {
  preview.as = p
  savePreview(p)
}
auth.blocks = () => {
  const p = previewing()
  return p ? `Read-only while viewing as ${describe(p)}. Exit the preview to change anything.` : null
}

// The bot answers some reads by who asks: every channel, and every change, for an admin. While previewing, those are
// narrowed to what the previewed role would get: its channels, and the changes in them (or its own, elsewhere).
auth.scope = (path, body) => {
  const p = previewing()
  if (!p) return body
  const mine = new Set(projected(p).channels ?? [])
  if (path === '/channels') {
    const b = body as { channels?: Channel[] }
    if (!Array.isArray(b?.channels)) return body
    return { ...b, channels: b.channels.filter((c) => mine.has(c.login.toLowerCase())) }
  }
  if (path === '/audit' || path.startsWith('/audit?')) {
    const b = body as { entries?: AuditEntry[] }
    if (!Array.isArray(b?.entries)) return body
    const own = (e: AuditEntry) => !!state.user && e.actor_user_id === state.user.id
    return {
      ...b,
      entries: b.entries.filter((e) => (e.channel_login ? mine.has(e.channel_login.toLowerCase()) : own(e))),
    }
  }
  const roles = /^\/channels\/([^/?]+)\/roles$/.exec(path)
  if (roles) return { ...(body as ChannelRoles), your_rank: projected(p).channelRanks?.[decodeURIComponent(roles[1]!).toLowerCase()] ?? 0 }
  return body
}

/** The session a preview stands for: what that role's own session would say. */
function projected(p: Preview) {
  const channel = p.channel
  const listed = channel !== null && p.rank >= 80 // the bot lists a channel for its moderators and broadcaster
  const broadcaster = p.role === 'broadcaster' && channel !== null
  return {
    authenticated: p.role !== 'signed-out',
    role: (p.role === 'signed-out' ? null : listed ? 'moderator' : 'user') as SessionRole | null,
    channels: p.role === 'signed-out' ? null : listed ? [channel] : [],
    channelRoles:
      p.role === 'signed-out' ? null : listed ? { [channel]: broadcaster ? ('broadcaster' as const) : ('moderator' as const) } : {},
    channelRanks: p.role === 'signed-out' ? null : channel !== null ? { [channel]: p.rank } : {},
    ownChannel: broadcaster ? { login: channel, joined: true, status: 'joined', tier: p.tier ?? 'full' } : null,
  }
}

/** The session the pages see: the real one, or the one a preview stands for. */
export const session = {
  get checked() { return state.checked },
  get enabled() { return state.enabled },
  get twitchLogin() { return state.twitchLogin },
  get expiresAt() { return state.expiresAt },
  get notice() { return state.notice },
  get authenticated() { const p = previewing(); return p ? projected(p).authenticated : state.authenticated },
  get role() { const p = previewing(); return p ? projected(p).role : state.role },
  get user() { const p = previewing(); return p && p.role === 'signed-out' ? null : state.user },
  get channels(): readonly string[] | null { const p = previewing(); return p ? projected(p).channels : state.channels },
  get channelRoles(): Readonly<Record<string, 'broadcaster' | 'moderator'>> | null {
    const p = previewing()
    return p ? projected(p).channelRoles : state.channelRoles
  },
  get channelRanks(): Readonly<Record<string, number>> | null { const p = previewing(); return p ? projected(p).channelRanks : state.channelRanks },
  get ownChannel(): Readonly<OwnChannel> | null { const p = previewing(); return p ? projected(p).ownChannel : state.ownChannel },
}

function apply(s: Session) {
  state.checked = true
  state.authenticated = s.authenticated
  state.enabled = s.admin_enabled
  state.twitchLogin = !!s.twitch_login
  state.expiresAt = s.expires_at
  state.role = s.role ?? null
  state.user = s.user ?? null
  state.channels = s.channels ?? null
  state.channelRoles = s.channel_roles ?? null
  state.channelRanks = s.channel_ranks ?? null
  state.ownChannel = s.own_channel ?? null
  auth.csrf = s.csrf
}

function clear() {
  state.authenticated = false
  state.expiresAt = null
  state.role = null
  state.user = null
  state.channels = null
  state.channelRoles = null
  state.channelRanks = null
  state.ownChannel = null
  auth.csrf = null
}

let onExpired: (() => void) | null = null
/** Called (by main.ts) with a way to reach the sign-in page when the session ends mid-use. */
export function setExpiredHandler(fn: () => void) {
  onExpired = fn
}

auth.onUnauthorized = () => {
  if (!state.authenticated) return
  clear()
  state.notice = 'Your session ended. Sign in again.'
  onExpired?.()
}

let pending: Promise<void> | null = null
/** Loads the session once; later calls share the answer. */
export function ensure(): Promise<void> {
  if (state.checked) return Promise.resolve()
  pending ??= admin
    .session()
    .then(apply)
    .catch(() => {
      // The bot is unreachable: treat it as signed out; the sign-in page shows the error when it tries.
      state.checked = true
      state.authenticated = false
    })
    .finally(() => (pending = null))
  return pending
}

/** Asks the bot again, after something that changes what the session manages (adding the bot to a channel). */
export function refresh(): Promise<void> {
  state.checked = false
  return ensure()
}

/**
 * Where the Twitch sign-in starts: the bot sends the person to Twitch (or through the vexoulz account, ADR-0023) and
 * back to its own callback, which sets the session cookie and lands on `next` (a path on this site), or on
 * /admin/login?error=<reason> when it fails.
 */
export function twitchLoginUrl(next: string): string {
  return `/auth/admin/login?${new URLSearchParams({ next })}`
}

/** Where a broadcaster grants the bot more of their channel (a basic or moderator tier becomes full). */
export const CONNECT_URL = '/auth/connect'

const BOUNCED = 'dtp:signin-bounced'
/**
 * Someone signed in to their vexoulz account but without a bot session goes through the bot's sign-in once, which
 * comes straight back signed in. At most once per tab, so a sign-in that fails can't loop. True if it navigated.
 */
export function bounceOnce(accountSignedIn: boolean, here: string, go = (url: string) => window.location.assign(url)): boolean {
  if (!accountSignedIn || !state.checked || state.authenticated || !state.twitchLogin) return false
  try {
    if (sessionStorage.getItem(BOUNCED)) return false
    sessionStorage.setItem(BOUNCED, '1')
  } catch {
    return false // no storage: no way to tell a second bounce from the first, so none at all
  }
  go(twitchLoginUrl(here))
  return true
}

/** Why a Twitch sign-in came back to the sign-in page (`?error=` from the bot's callback). */
export const SIGNIN_ERRORS: Record<string, string> = {
  denied: 'The sign-in was cancelled on Twitch.',
  expired: 'The sign-in took too long, or was finished in another browser. Try again.',
  twitch: "Twitch didn't answer. Try again in a moment.",
  no_channels: "That Twitch account doesn't own or moderate any channel the bot is in.",
  not_configured: "Signing in with Twitch isn't set up on this bot.",
}

export async function login(password: string): Promise<void> {
  apply(await admin.login(password))
  state.notice = null
}

export async function logout(): Promise<void> {
  viewAs(null)
  try {
    await admin.logout()
  } finally {
    clear()
  }
}

/** Adds the bot to the user's own channel; the session manages it straight away. */
export async function joinOwnChannel(): Promise<void> {
  await admin.joinOwn()
  await refresh()
}
