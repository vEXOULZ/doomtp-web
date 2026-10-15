// How a trigger reads in a list: what sets it off, its timing conditions and its cooldowns. Shared by a channel's
// Triggers tab and the triggers on My packs.

type Timed = { match: Record<string, unknown>; schedule: Record<string, unknown> }

/** `90s`, `15m`, `2h`. */
export const every = (s: number) => (s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`)

/** A listener's pattern, a cron's schedule, a timer's interval, or an event's conditions. */
export function matches(t: Timed) {
  if (typeof t.match.regex === 'string') return t.match.regex
  if (typeof t.schedule.cron === 'string') return t.schedule.cron
  if (typeof t.schedule.every_s === 'number') return `every ${every(t.schedule.every_s)}`
  const rest = { ...t.match, ...t.schedule }
  return Object.keys(rest).length ? JSON.stringify(rest) : ''
}

export const conditions = (t: Timed) =>
  [t.schedule.only_live && 'only live', t.schedule.min_chat_lines && `${t.schedule.min_chat_lines}+ lines`, t.schedule.jitter_s && `±${t.schedule.jitter_s}s`]
    .filter(Boolean)
    .join(' · ')

export const cooldowns = (t: { cooldown_s?: number; user_cooldown_s?: number }) =>
  [t.cooldown_s && `${every(t.cooldown_s)} cooldown`, t.user_cooldown_s && `${every(t.user_cooldown_s)} per chatter`].filter(Boolean).join(' · ')

/** Events that need something the channel granted the bot (ADR-0007). */
export const NEEDS: Record<string, string> = { follow: 'followers', redemption: 'redemptions', cheer: 'bits' }
