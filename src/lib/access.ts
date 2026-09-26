// Who may do what on the admin pages. Today the only way in is the bot's admin password, so everyone signed in is
// an admin. Once the bot signs people in with Twitch (and says so in the session's `role`), a channel's moderators
// get the moderator view: the day-to-day parts of their own channel, without the bot-wide controls.
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
