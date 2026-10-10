// Who may do what on the Manage pages, as the bot decides it (ADR-0017, ADR-0026): the web mirrors chat. In a channel
// the session has the rank chat would give it there (moderator, broadcaster, raised by any custom role it holds);
// the admin password and bot admins have the bot-admin rank everywhere. Everyone signed in has their personal area.
// The bot enforces all of this; the pages only avoid offering what it would refuse.
import { rankOf } from './ranks'
import { session } from './session'

/** The built-in roles the web gates on; their ranks come from the bot (GET /roles, lib/ranks.ts). */
type GateRole = 'moderator' | 'broadcaster'

type Need =
  | { scope: 'personal' } // anyone signed in, about themselves
  | { scope: 'channel'; role: GateRole } // at least this role's rank in the channel
  | { scope: 'bot' } // a bot admin

const personal: Need = { scope: 'personal' }
const bot: Need = { scope: 'bot' }
const channel = (role: GateRole): Need => ({ scope: 'channel', role })

/** Everything a page can gate on, and what it needs. */
const NEEDS = {
  // yours, wherever you are
  me: personal,
  explain: personal,
  audit: personal,
  'channel.add-own': personal,
  // a channel's day-to-day, as its moderators run it in chat
  'channel.view': channel('moderator'),
  'modules.toggle': channel('moderator'),
  'commands.edit': channel('moderator'),
  'publications.toggle': channel('moderator'),
  'triggers.edit': channel('moderator'),
  'filter.edit': channel('moderator'),
  'ignored.edit': channel('moderator'),
  'settings.chat': channel('moderator'),
  'settings.backfill': channel('moderator'),
  'settings.public-log': channel('moderator'),
  'explain.as': channel('moderator'),
  runs: channel('moderator'),
  messages: channel('moderator'),
  variables: channel('moderator'),
  'channel.audit': channel('moderator'),
  // what chat keeps for the broadcaster
  'settings.logging': channel('broadcaster'),
  'settings.roles': channel('broadcaster'),
  'backfill.run': channel('broadcaster'),
  'channel.part': channel('broadcaster'),
  'channel.upgrade': channel('broadcaster'),
  // the bot itself
  'ignored.everywhere': bot,
  'channel.join': bot,
  'channel.probe': bot,
  keys: bot,
  health: bot,
  bot,
} as const satisfies Record<string, Need>
export type Action = keyof typeof NEEDS

/** Whether the session is the bot's admin: the password, a bot admin signed in with Twitch, or an older bot's
 *  session that doesn't say (those were all admins). */
export const isAdmin = () => session.authenticated && (session.role === 'admin' || session.role === null)

/** The session's chat rank in a channel: 0 where it manages nothing. */
export function rankIn(login: string): number {
  if (!session.authenticated) return 0
  if (isAdmin()) return rankOf('bot_admin') ?? Infinity
  const key = login.toLowerCase()
  const rank = session.channelRanks?.[key]
  if (rank !== undefined) return rank
  const role = session.channelRoles?.[key]
  if (role) return rankOf(role) ?? 0
  // A bot from before channel ranks lists the channels only, all as a moderator.
  return session.channels?.includes(key) ? (rankOf('moderator') ?? 0) : 0
}

/** The highest rank the session has in any channel (what a page without one channel may offer). */
function bestRank(): number {
  if (isAdmin()) return rankOf('bot_admin') ?? Infinity
  return Math.max(0, ...(session.channels ?? []).map(rankIn))
}

/** Whether the session reaches `rank` in `login`: for the settings a channel sets itself (`publish_min_role`...). */
export const reaches = (login: string, rank: number) => rankIn(login) >= rank

/** Whether the session reaches a role a channel setting names (`publish_min_role`...), given the bot's roles (GET
 *  /roles). A custom role the list doesn't rank counts as a moderator's: the bot decides either way. */
export function reachesRole(login: string, role: string | null | undefined, roles: { name: string; rank: number }[]): boolean {
  if (!role) return can('channel.view', login)
  const rank = roles.find((r) => r.name === role)?.rank ?? rankOf('moderator')
  return rank !== undefined && rankIn(login) >= rank
}

/** Whether the session may do `action`, in channel `login` for a channel action (without one: in any channel). */
export function can(action: Action, login?: string): boolean {
  if (!session.authenticated) return false
  const need: Need = NEEDS[action]
  if (need.scope === 'personal') return true
  if (need.scope === 'bot') return isAdmin()
  if (isAdmin()) return true // every channel, at the bot-admin rank
  // Until the bot has said what the role's rank is, nothing that needs it is offered.
  const rank = rankOf(need.role)
  return rank !== undefined && (login === undefined ? bestRank() : rankIn(login)) >= rank
}

/** Whether this session manages a channel (an admin every one). */
export const manages = (login: string) => can('channel.view', login)

/** Whether this is the signed-in user: they may lift an ignore they set on themselves. */
export const isMe = (userId: string) => session.user?.id === userId

/** Whether the user's own channel banned the bot: then only an admin can rejoin it. */
export const ownBanned = () => session.ownChannel?.status === 'banned'
/** Whether to offer adding the bot to the user's own channel. */
export const mayAddOwn = () => !!session.ownChannel && !session.ownChannel.joined && !ownBanned()
/** Whether to offer the broadcaster a reconnect for more of their channel (anything short of the full tier). */
export const mayUpgrade = () => !!session.ownChannel?.joined && !!session.ownChannel.tier && session.ownChannel.tier !== 'full'
