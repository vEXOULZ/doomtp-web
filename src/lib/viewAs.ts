// "View as", for bot admins: preview the site as someone signed out, a plain user, or someone with a given rank in one
// channel (a moderator, the broadcaster, or one of the channel's custom roles). Only what the pages show changes; the
// bot still sees an admin, so the site refuses every change while previewing (lib/session.ts). Kept per tab.
import { reactive } from 'vue'

export type PreviewRole = 'signed-out' | 'user' | 'moderator' | 'broadcaster' | 'custom'
export interface Preview {
  role: PreviewRole
  /** The channel the rank applies in; null for signed out and a plain user. */
  channel: string | null
  /** Chat's rank there: 80 a moderator, 100 the broadcaster, a custom role's own. */
  rank: number
  /** A custom role's name. */
  name?: string
  /** The previewed broadcaster's tier (their channel's real one). */
  tier?: string | null
}

/** "a moderator of #chan", for the banner and the refusal. */
export function describe(p: Preview): string {
  switch (p.role) {
    case 'signed-out':
      return 'someone signed out'
    case 'user':
      return 'a plain user'
    case 'moderator':
      return `a moderator of #${p.channel}`
    case 'broadcaster':
      return `the broadcaster of #${p.channel}`
    case 'custom':
      return `${p.name} (rank ${p.rank}) in #${p.channel}`
  }
}

const KEY = 'dtp:view-as'
const ROLES: PreviewRole[] = ['signed-out', 'user', 'moderator', 'broadcaster', 'custom']

/** The preview this tab had, if it still reads as one. */
export function loadPreview(): Preview | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Preview | null
    if (!p || !ROLES.includes(p.role) || typeof p.rank !== 'number') return null
    return p
  } catch {
    return null
  }
}
export function savePreview(p: Preview | null) {
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p))
    else sessionStorage.removeItem(KEY)
  } catch {
    // no storage: the preview lasts until the page reloads
  }
}

/** Whether the picker is open (the account menu opens it; the bar under the header holds it). */
export const picker = reactive({ open: false })
