// The bot session: one reactive session for the whole app. DtpShell loads it on every page, so the Manage bar
// shows as soon as someone is signed in; the router guard awaits it on /manage pages. A 401 from any call made with
// the session drops it, and the next step lands on the sign-in page.
import { reactive, readonly } from 'vue'
import { admin, type OwnChannel, type Session, type SessionRole } from './admin'
import { auth } from './api'
import { loadRanks } from './ranks'
import { header, loadPreview, savePreview, type Preview } from './viewAs'

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
// An admin can preview the site as another role (lib/viewAs.ts). The bot does the previewing (ADR-0030): every call
// carries the preview's X-View-As, so the bot answers as it would answer that viewer and refuses every change, and
// GET /session with it gives the session that viewer would have, which the pages then read.
const preview = reactive({ as: null as Preview | null, session: null as Session | null })
const realAdmin = () => state.authenticated && (state.role === 'admin' || state.role === null)
/** Whether the real session may preview other roles. */
export const mayViewAs = realAdmin
/** What the site is previewed as, or null (never for anyone but an admin, and only once the bot has answered). */
export const previewing = (): Preview | null => (realAdmin() && preview.session ? preview.as : null)
/** Changes with every preview, so the pages can load again as the new role (App.vue keys the page on it). */
export const previewKey = () => JSON.stringify(previewing())
/** Starts, changes or (with null) ends a preview. The bot works out the previewed session first: one it refuses (a
 *  channel it doesn't know) leaves the current preview as it was, and throws. */
export async function viewAs(p: Preview | null): Promise<void> {
  const found = p ? await admin.previewSession(header(p)) : null
  preview.as = p
  preview.session = found
  savePreview(p)
}
auth.viewAs = () => {
  const p = previewing()
  return p ? header(p) : null
}

/** The previewed session while previewing, else null. */
const shown = (): Session | null => (previewing() ? preview.session : null)

/** The session the pages see: the real one, or the one the bot gave for the preview. */
export const session = {
  get checked() { return state.checked },
  get enabled() { return state.enabled },
  get twitchLogin() { return state.twitchLogin },
  get expiresAt() { return state.expiresAt },
  get notice() { return state.notice },
  get authenticated() { const s = shown(); return s ? s.authenticated : state.authenticated },
  get role(): SessionRole | null { const s = shown(); return s ? (s.role ?? null) : state.role },
  get user(): Readonly<{ id: string; login: string }> | null { const s = shown(); return s ? (s.user ?? null) : state.user },
  get channels(): readonly string[] | null { const s = shown(); return s ? (s.channels ?? null) : state.channels },
  get channelRoles(): Readonly<Record<string, 'broadcaster' | 'moderator'>> | null {
    const s = shown()
    return s ? (s.channel_roles ?? null) : state.channelRoles
  },
  get channelRanks(): Readonly<Record<string, number>> | null { const s = shown(); return s ? (s.channel_ranks ?? null) : state.channelRanks },
  get ownChannel(): Readonly<OwnChannel> | null { const s = shown(); return s ? (s.own_channel ?? null) : state.ownChannel },
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
  preview.session = null
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
/** Loads the session once, with chat's ranks and an admin's preview (this tab's, after a reload); later calls share
 *  the answer. */
export function ensure(): Promise<void> {
  if (state.checked) return Promise.resolve()
  const real = admin
    .session()
    .then(apply)
    .catch(() => {
      // The bot is unreachable: treat it as signed out; the sign-in page shows the error when it tries.
      state.checked = true
      state.authenticated = false
    })
  pending ??= Promise.all([real, loadRanks()])
    .then(restorePreview)
    .finally(() => (pending = null))
  return pending
}

/** Asks the bot for the preview's session again (or this tab's stored one); a preview it refuses now ends. */
async function restorePreview(): Promise<void> {
  const p = preview.as ?? loadPreview()
  if (!p || !realAdmin()) return
  await viewAs(p).catch(() => viewAs(null))
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
