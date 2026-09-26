// Who may do what on the admin pages, as the bot decides it (ADR-0017). The admin password and bot admins signed in
// with Twitch are admins; everyone else signed in with Twitch is a moderator of the channels in their session: the
// day-to-day parts of those channels, without the bot-wide controls. The bot enforces all of this; the pages only
// avoid offering what it would refuse.
import { computed } from 'vue'
import { session } from './session'

export type Access = 'moderator' | 'admin'

/** Everything a page can gate on, and the least access it needs. */
const NEEDS = {
  // day-to-day moderation of a channel
  'modules.toggle': 'moderator',
  'triggers.edit': 'moderator',
  'filter.edit': 'moderator',
  'ignored.edit': 'moderator',
  'ignored.everywhere': 'admin',
  'settings.chat': 'moderator',
  explain: 'moderator',
  audit: 'moderator',
  // the bot itself
  'channel.join': 'admin',
  'channel.part': 'admin',
  'settings.logging': 'admin',
  'settings.roles': 'admin',
  keys: 'admin',
  health: 'admin',
} as const satisfies Record<string, Access>
export type Action = keyof typeof NEEDS

const RANK: Record<Access, number> = { moderator: 1, admin: 2 }

export const access = computed<Access>(() => session.role ?? 'admin')
export const can = (action: Action) => RANK[access.value] >= RANK[NEEDS[action]]

/** Whether this session manages a channel (a moderator only their own; an admin every one). */
export const manages = (login: string) => session.channels === null || session.channels.includes(login.toLowerCase())

/** Whether this is the signed-in user: they may lift an ignore they set on themselves. */
export const isMe = (userId: string) => session.user?.id === userId
