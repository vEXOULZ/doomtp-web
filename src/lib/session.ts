// The admin session: one reactive session for the whole app, the same shape as vods'. The router guard calls
// `ensure()`; a 401 from any admin call drops the session so the next step lands on the sign-in page.
import { reactive, readonly } from 'vue'
import { admin, type Session } from './admin'
import { auth } from './api'

const state = reactive({
  checked: false,
  authenticated: false,
  /** False when the bot has no admin password set. */
  enabled: true,
  expiresAt: null as number | null,
  /** Why the admin was sent to the sign-in page (an expired session). */
  notice: null as string | null,
})
export const session = readonly(state)

function apply(s: Session) {
  state.checked = true
  state.authenticated = s.authenticated
  state.enabled = s.admin_enabled
  state.expiresAt = s.expires_at
  auth.csrf = s.csrf
}

let onExpired: (() => void) | null = null
/** Called (by main.ts) with a way to reach the sign-in page when the session ends mid-use. */
export function setExpiredHandler(fn: () => void) {
  onExpired = fn
}

auth.onUnauthorized = () => {
  if (!state.authenticated) return
  state.authenticated = false
  auth.csrf = null
  state.notice = 'Your session ended. Sign in again.'
  onExpired?.()
}

let pending: Promise<void> | null = null
/** Loads the session once; the guard awaits it on every admin navigation. */
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

export async function login(password: string): Promise<void> {
  apply(await admin.login(password))
  state.notice = null
}

export async function logout(): Promise<void> {
  try {
    await admin.logout()
  } finally {
    state.authenticated = false
    state.expiresAt = null
    auth.csrf = null
  }
}
