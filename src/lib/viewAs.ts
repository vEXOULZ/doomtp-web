// "View as", for bot admins: preview the site as someone signed out, a plain user, or someone with a given rank in one
// channel (a moderator, the broadcaster, or one of the channel's custom roles). The bot does the previewing (ADR-0030):
// every call carries `X-View-As` (header() here), the bot answers as it would answer that viewer, and refuses every
// change. Kept per tab.
import { reactive } from 'vue'

export type PreviewRole = 'signed-out' | 'user' | 'moderator' | 'broadcaster' | 'custom'
export interface Preview {
  role: PreviewRole
  /** The channel the role is in; null for signed out and a plain user. */
  channel: string | null
  /** A custom role's rank (the bot takes the role as its rank). */
  rank?: number
  /** A custom role's name. */
  name?: string
}

/** The `X-View-As` value the bot takes for a preview. */
export function header(p: Preview): string {
  switch (p.role) {
    case 'signed-out':
    case 'user':
      return p.role
    case 'moderator':
    case 'broadcaster':
      return `${p.role}@${p.channel}`
    case 'custom':
      return `${p.rank}@${p.channel}`
  }
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
    if (!p || !ROLES.includes(p.role)) return null
    const needsChannel = p.role !== 'signed-out' && p.role !== 'user'
    if (needsChannel && typeof p.channel !== 'string') return null
    if (p.role === 'custom' && typeof p.rank !== 'number') return null
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
