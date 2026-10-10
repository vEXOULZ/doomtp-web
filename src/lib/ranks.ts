// Chat's role ranks as the bot gives them (GET /roles): the built-in roles the Manage pages gate on (moderator,
// broadcaster, bot_admin...) and the range a channel's custom roles take. Loaded with the session (lib/session.ts).
import { reactive } from 'vue'
import { api } from './api'

const state = reactive({
  ranks: {} as Record<string, number>,
  custom: null as [number, number] | null,
})

/** A built-in role's rank, or undefined before /roles has answered (and for a role it doesn't list). */
export const rankOf = (role: string): number | undefined => state.ranks[role]

/** Whether `rank` is one a channel's custom role may have (and so one "View as" can preview). */
export const customRank = (rank: number) => !!state.custom && rank >= state.custom[0] && rank <= state.custom[1]

/** Loads the ranks once; a failure leaves them unknown, and the pages offer nothing that needs one. */
export async function loadRanks(): Promise<void> {
  try {
    const got = await api.roles()
    state.ranks = Object.fromEntries(got.roles.map((r) => [r.name, r.rank]))
    state.custom = got.custom_rank_range
  } catch {
    // The bot is unreachable: the next ensure() after a refresh asks again.
  }
}
