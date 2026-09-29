// Who may do what on the Manage pages, as the bot decides it (ADR-0017, ADR-0026): the web mirrors chat. In a channel
// the session has the rank chat would give it there (moderator, broadcaster, raised by any custom role it holds);
// the admin password and bot admins have the bot-admin rank everywhere. Everyone signed in has their personal area.
// The bot enforces all of this; the pages only avoid offering what it would refuse.
import { session } from './session'

/** Chat's built-in ranks (GET /roles), the ones the web gates on. */
export const RANK = { everyone: 0, moderator: 80, broadcaster: 100, bot_admin: 1000 } as const

type Need =
  | { scope: 'personal' } // anyone signed in, about themselves
  | { scope: 'channel'; rank: number } // at least this rank in the channel
  | { scope: 'bot' } // a bot admin

const personal: Need = { scope: 'personal' }
const bot: Need = { scope: 'bot' }
const channel = (rank: number): Need => ({ scope: 'channel', rank })

/** Everything a page can gate on, and what it needs. */
const NEEDS = {
  // yours, wherever you are
  me: personal,
  explain: personal,
  audit: personal,
  'channel.add-own': personal,
  // a channel's day-to-day, as its moderators run it in chat
  'channel.view': channel(RANK.moderator),
  'modules.toggle': channel(RANK.moderator),
  'commands.edit': channel(RANK.moderator),
  'publications.toggle': channel(RANK.moderator),
  'triggers.edit': channel(RANK.moderator),
  'filter.edit': channel(RANK.moderator),
  'ignored.edit': channel(RANK.moderator),
  'settings.chat': channel(RANK.moderator),
  'settings.backfill': channel(RANK.moderator),
  'settings.public-log': channel(RANK.moderator),
  'explain.as': channel(RANK.moderator),
  runs: channel(RANK.moderator),
  messages: channel(RANK.moderator),
  variables: channel(RANK.moderator),
  'channel.audit': channel(RANK.moderator),
  // what chat keeps for the broadcaster
  'settings.logging': channel(RANK.broadcaster),
  'settings.roles': channel(RANK.broadcaster),
  'channel.part': channel(RANK.broadcaster),
  'channel.upgrade': channel(RANK.broadcaster),
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
  if (isAdmin()) return RANK.bot_admin
  const key = login.toLowerCase()
  const rank = session.channelRanks?.[key]
  if (rank !== undefined) return rank
  const role = session.channelRoles?.[key]
  if (role) return RANK[role]
  // A bot from before channel ranks lists the channels only, all as a moderator.
  return session.channels?.includes(key) ? RANK.moderator : 0
}

/** The highest rank the session has in any channel (what a page without one channel may offer). */
function bestRank(): number {
  if (isAdmin()) return RANK.bot_admin
  return Math.max(0, ...(session.channels ?? []).map(rankIn))
}

/** Whether the session reaches `rank` in `login`: for the settings a channel sets itself (`publish_min_role`...). */
export const reaches = (login: string, rank: number) => rankIn(login) >= rank

/** Whether the session reaches a role a channel setting names (`publish_min_role`...), given the bot's roles (GET
 *  /roles). A custom role the list doesn't rank counts as a moderator's: the bot decides either way. */
export function reachesRole(login: string, role: string | null | undefined, roles: { name: string; rank: number }[]): boolean {
  if (!role) return can('channel.view', login)
  const rank = roles.find((r) => r.name === role)?.rank ?? RANK.moderator
  return rankIn(login) >= rank
}

/** Whether the session may do `action`, in channel `login` for a channel action (without one: in any channel). */
export function can(action: Action, login?: string): boolean {
  if (!session.authenticated) return false
  const need: Need = NEEDS[action]
  if (need.scope === 'personal') return true
  if (need.scope === 'bot') return isAdmin()
  return (login === undefined ? bestRank() : rankIn(login)) >= need.rank
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
