// The admin half of the bot's JSON API (ADR-0016): the session, API keys, and a channel's settings. Every call
// needs the admin session cookie; writes also send its CSRF token (see `auth` in api.ts).
import type { ChannelCommand, CommandRulePatch } from './modules'
import { request, type ExplainReport, type Publication } from './api'

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const at = (login: string) => `/channels/${encodeURIComponent(login)}`

export interface Session {
  authenticated: boolean
  csrf: string | null
  /** Epoch ms. */
  expires_at: number | null
  /** False when the bot has no admin password: nobody can sign in. */
  admin_enabled: boolean
  /** Who is behind the session (bot ADR-0017): the password is an admin with no user; a Twitch sign-in names the
   *  user, and a moderator's `channels` are the logins they may manage (null: every channel). */
  role?: 'moderator' | 'admin' | null
  user?: { id: string; login: string } | null
  channels?: string[] | null
  /** Whether the bot offers signing in with Twitch (`/auth/admin/login`); older bots don't say, which means no. */
  twitch_login?: boolean
}

export interface ApiKey {
  id: number
  name: string
  scopes: string[]
  created_at: number
  last_used_at: number | null
}

export interface Channel {
  channel_id: string
  login: string
  active: boolean
  status: string
  banned: boolean
  tier: string
  capabilities: string[]
  prefix: string
  timezone: string
  log_enabled: boolean
  history_backfill: boolean
  quiet_errors: boolean
  cc_edit_notice: boolean
  reply_hold_ms: number
  automod: { action: string; timeout_s: number }
  roles: Record<'channel_var_write' | 'grant_min' | 'publish_min' | 'create_min' | 'var_admin', string>
}
export type ChannelPatch = Partial<{
  prefix: string
  quiet_errors: boolean
  cc_edit_notice: boolean
  log_enabled: boolean
  history_backfill: boolean
  reply_hold_ms: number
  timezone: string
  automod_action: string
  automod_timeout_s: number
  channel_var_write_role: string
  grant_min_role: string
  publish_min_role: string
  create_min_role: string
  var_admin_role: string
}>

export interface Module {
  module: string
  enabled: boolean
  toggleable: boolean
}
export interface FilterEntry {
  id: number
  pattern: string
  kind: string
  action: string
  category: string
  replacement: string
  enabled: boolean
  /** Bot-wide entries show in every channel and can't be changed from one. */
  global: boolean
}
/** Older bots send bare user ids; newer ones say who ignored them, when and why. */
export type IgnoredRaw =
  | string
  | { user_id: string; login?: string | null; reason?: string | null; added_by?: string | null; added_by_login?: string | null; added_at?: number | null }
export interface Ignored {
  userId: string
  login: string | null
  reason: string | null
  addedBy: string | null
  addedByLogin: string | null
  addedAt: number | null
  /** They asked to be ignored themselves, so they may take it back. */
  self: boolean
  everywhere: boolean
}
export function readIgnored(raw: IgnoredRaw, everywhere: boolean): Ignored {
  const e = typeof raw === 'string' ? { user_id: raw } : raw
  const addedBy = e.added_by ?? null
  return {
    userId: e.user_id,
    login: e.login ?? null,
    reason: e.reason ?? null,
    addedBy,
    addedByLogin: e.added_by_login ?? null,
    addedAt: e.added_at ?? null,
    self: addedBy !== null && addedBy === e.user_id,
    everywhere,
  }
}

export interface Trigger {
  id: number
  type: string
  expr: string
  match: Record<string, unknown>
  schedule: Record<string, unknown>
  enabled: boolean
  run_as_rank: number
}
export interface AuditEntry {
  id: number
  channel_id: string | null
  actor_user_id: string | null
  via: string
  action: string
  target: string | null
  before: unknown
  after: unknown
  /** Epoch ms. */
  at: number
}
/** /readyz: each component's status and whatever detail it reports. */
export interface Health {
  status: string
  version?: string
  components: Record<string, { status: string } & Record<string, unknown>>
}

export const EXPLAIN_BADGES = ['subscriber', 'vip', 'moderator', 'lead_moderator'] as const

export const admin = {
  session: () => request<Session>('/session'),
  login: (password: string) => request<Session>('/session', json('POST', { password })),
  logout: () => request<unknown>('/session', json('DELETE')),

  keys: () => request<{ keys: ApiKey[] }>('/keys'),
  createKey: (name: string, scopes: string[]) => request<ApiKey & { secret: string }>('/keys', json('POST', { name, scopes })),
  revokeKey: (id: number) => request<unknown>(`/keys/${id}`, json('DELETE')),

  channels: () => request<{ channels: Channel[] }>('/channels'),
  channel: (login: string) => request<Channel>(at(login)),
  join: (login: string, rejoin = false) => request<Channel>('/channels', json('POST', { login, rejoin })),
  part: (login: string) => request<unknown>(at(login), json('DELETE')),
  patch: (login: string, patch: ChannelPatch) => request<Channel>(at(login), json('PATCH', patch)),

  modules: (login: string) => request<{ modules: Module[] }>(`${at(login)}/modules`),
  setModule: (login: string, module: string, enabled: boolean) =>
    request<unknown>(`${at(login)}/modules/${encodeURIComponent(module)}`, json('PUT', { enabled })),

  publications: (login: string) => request<{ publications: Publication[] }>(`${at(login)}/publications`),

  triggers: (login: string) => request<{ triggers: Trigger[] }>(`${at(login)}/triggers`),
  setTrigger: (login: string, id: number, enabled: boolean) =>
    request<unknown>(`${at(login)}/triggers/${id}`, json('PATCH', { enabled })),
  deleteTrigger: (login: string, id: number) => request<unknown>(`${at(login)}/triggers/${id}`, json('DELETE')),

  filters: (login: string) => request<{ filters: FilterEntry[] }>(`${at(login)}/filters`),
  addFilter: (login: string, body: { pattern: string; kind: string; action: string; replacement?: string }) =>
    request<FilterEntry>(`${at(login)}/filters`, json('POST', body)),
  setFilter: (login: string, id: number, enabled: boolean) =>
    request<unknown>(`${at(login)}/filters/${id}`, json('PATCH', { enabled })),
  deleteFilter: (login: string, id: number) => request<unknown>(`${at(login)}/filters/${id}`, json('DELETE')),

  ignored: (login: string) => request<{ ignored: IgnoredRaw[]; ignored_everywhere: IgnoredRaw[] }>(`${at(login)}/ignored`),
  /** Ignore a user here, or in every channel. */
  ignore: (login: string, body: { login: string; everywhere?: boolean; reason?: string }) =>
    request<{ user_id: string; login: string; everywhere: boolean }>(`${at(login)}/ignored`, json('POST', body)),
  /** Stop ignoring a user here (or everywhere). A signed-in user may lift an ignore they set on themselves. */
  unignore: (login: string, userId: string, everywhere = false) =>
    request<unknown>(`${at(login)}/ignored/${encodeURIComponent(userId)}${everywhere ? '?everywhere=true' : ''}`, json('DELETE')),
  channelCommands: (login: string) => request<{ commands: ChannelCommand[] }>(`${at(login)}/commands`),
  setCommand: (login: string, name: string, patch: CommandRulePatch) =>
    request<Pick<ChannelCommand, 'name' | 'enabled' | 'required_role' | 'allowed_roles'>>(
      `${at(login)}/commands/${encodeURIComponent(name)}`,
      json('PATCH', patch),
    ),
  audit: (limit = 50) => request<{ entries: AuditEntry[] }>(`/audit?limit=${limit}`),

  explainAs: (body: { text: string; channel: string; as_user?: string; badges: string[]; run: boolean; context?: string }) =>
    request<ExplainReport>('/explain', json('POST', { context: 'line', ...body })),
}

/** /readyz lives outside /api/v1, and answers 503 with the same body when something is down. */
export async function health(): Promise<Health> {
  const response = await fetch('/readyz', { headers: { accept: 'application/json' } })
  return (await response.json()) as Health
}

