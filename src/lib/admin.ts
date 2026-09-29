// The managing half of the bot's JSON API (ADR-0016, ADR-0026): the session, a channel's settings and logs, and
// the bot's own. Every call needs the session cookie; writes also send its CSRF token (see `auth` in api.ts).
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
  /** False when the bot has no admin password, or takes it only from networks this visitor isn't on. */
  admin_enabled: boolean
  /** Who is behind the session (bot ADR-0017): the password is an admin with no user; a Twitch sign-in names the
   *  user, and a moderator's `channels` are the logins they may manage (null: every channel). */
  role?: SessionRole | null
  user?: { id: string; login: string } | null
  channels?: string[] | null
  /** Whether the bot offers signing in with Twitch (`/auth/admin/login`); older bots don't say, which means no. */
  twitch_login?: boolean
  /** Why the session manages each channel, and its chat rank there, custom roles included (ADR-0026). Null for an
   *  admin, who manages every channel. */
  channel_roles?: Record<string, 'broadcaster' | 'moderator'> | null
  channel_ranks?: Record<string, number> | null
  /** The signed-in user's own channel: whether the bot is in it, and at what tier. Null for the admin password. */
  own_channel?: OwnChannel | null
}

/** `user` manages no channel; `moderator` manages the ones in `channels`; `admin` manages the bot. */
export type SessionRole = 'user' | 'moderator' | 'admin'

export interface OwnChannel {
  login: string
  joined: boolean
  status: string | null
  /** `full`, `moderator` or `basic`: how much the broadcaster granted (below full, reconnect to upgrade). */
  tier: string | null
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
  /** Anyone may search the chat log while this and `log_enabled` are on; off, only moderators can. Older bots
   *  don't send it. */
  public_log?: boolean
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
  public_log: boolean
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
  /** Sent by bots from ADR-0026 on. */
  log_level?: string
  created_by?: string | null
}
export const TRIGGER_EVENTS = [
  'redemption', 'raid', 'sub', 'resub', 'gift_sub', 'cheer', 'follow', 'stream_online', 'stream_offline',
] as const
export interface TriggerBody {
  type: string
  expr: string
  match?: Record<string, unknown>
  schedule?: Record<string, unknown>
  /** At most the creator's own rank, which is the default. */
  run_as_rank?: number
  log_level?: string
}

export interface Variable {
  name: string
  value: unknown
  updated_at: number | null
  updated_by: string | null
}
/** A variable owner's limits: its quota, the largest value, list length and names per namespace. */
export interface Limits {
  quota_bytes: number
  value_cap_bytes: number
  list_items: number
  names_per_space: number
}
export type LimitsPatch = Partial<{ [K in keyof Limits]: number | null }>
export interface Storage extends Limits {
  used_bytes: number
  /** Bytes used per namespace. */
  namespaces: Record<string, number>
}
export const OWNER_KINDS = ['channel', 'publisher', 'chatter'] as const
export interface LimitOverride extends Partial<{ [K in keyof Limits]: number | null }> {
  owner_kind: string
  owner_id: string
}

/** One command or trigger run (the bot keeps them for a while). */
export interface Run {
  user_id: string | null
  trigger_type: string | null
  expr: string
  code: string | null
  message: string | null
  duration_ms: number | null
  cancelled_reason: string | null
  at: number
}

export interface LogUser {
  id: string
  login: string | null
  display_name?: string | null
}
/** One line of a channel's log timeline: a chat message, a notification (sub, raid...), or a moderation action. */
export type LogEntry =
  | { kind: 'message'; id: string; at: number; user: LogUser | null; text: string; deleted_at: number | null; cleared_at: number | null; is_command: boolean; source: string }
  | { kind: 'notification'; id: string | number; at: number; user: LogUser | null; type: string; payload: unknown; source: string }
  | { kind: 'moderation'; id: string | number; at: number; type: string; target: LogUser | null; moderator: LogUser | null; duration_s: number | null; reason: string | null; source: string }
export interface LogQuery {
  q?: string
  user?: string
  kind?: ('message' | 'notification' | 'moderation')[]
  hide_removed?: boolean
  cursor?: string
  limit?: number
}

/** A host `http get` may fetch; the secret shows its kind and name, never its value. */
export interface HttpHost {
  pattern: string
  plain_http: boolean
  secret: { kind: 'query' | 'header'; name: string } | null
  added_at: number | null
  added_by: string | null
}
export interface HttpLimits {
  channel_per_minute: number
  host_per_minute: number
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
  /** Filled in by bots from ADR-0026 on: the channel's and actor's logins, when known. */
  channel_login?: string | null
  actor_login?: string | null
}
export interface AuditQuery {
  limit?: number
  /** A channel login. */
  channel?: string
  /** A login, or `me`. */
  actor?: string
  /** `cc.edit`, or `cc.` for every cc one. */
  action?: string
  /** The `next` of the page before. */
  before?: number
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
  /** Adds the bot to the signed-in user's own channel at once (ADR-0026). */
  joinOwn: () => request<{ login: string; channel_id: string }>('/me/channel', json('POST')),

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
  /** `cc enable|disable`: for whoever reaches the channel's `publish_min_role`. */
  setPublication: (login: string, name: string, enabled: boolean) =>
    request<{ name: string; enabled: boolean }>(`${at(login)}/publications/${encodeURIComponent(name)}`, json('PATCH', { enabled })),

  triggers: (login: string) => request<{ triggers: Trigger[] }>(`${at(login)}/triggers`),
  setTrigger: (login: string, id: number, enabled: boolean) =>
    request<unknown>(`${at(login)}/triggers/${id}`, json('PATCH', { enabled })),
  createTrigger: (login: string, body: TriggerBody) => request<Trigger>(`${at(login)}/triggers`, json('POST', body)),
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
  variables: (login: string) => request<{ variables: Variable[] }>(`${at(login)}/variables`),
  storage: (login: string) => request<Storage>(`${at(login)}/storage`),
  runs: (login: string, limit = 50) => request<{ runs: Run[] }>(`${at(login)}/runs?limit=${limit}`),
  /** The channel's log as one timeline, newest first; pass `next` back as `cursor` for the page after. */
  log: (login: string, query: LogQuery = {}) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) for (const one of v) params.append(k, one)
      else if (v !== undefined && v !== '' && v !== false) params.set(k, String(v))
    }
    return request<{ channel_id: string; order: string; entries: LogEntry[]; next: string | null }>(`${at(login)}/log?${params}`)
  },

  variableLimits: () => request<{ defaults: Limits; overrides: LimitOverride[] }>('/variable-limits'),
  setDefaultLimits: (patch: LimitsPatch) => request<Limits>('/variable-limits/default', json('PATCH', patch)),
  /** One owner's override, by Twitch login; `null` in a field goes back to the default. */
  setOwnerLimits: (kind: string, user: string, patch: LimitsPatch) =>
    request<{ owner_kind: string; owner_id: string; override: LimitsPatch | null; effective: Limits }>(
      `/variable-limits/${encodeURIComponent(kind)}/${encodeURIComponent(user)}`,
      json('PATCH', patch),
    ),
  httpHosts: () => request<{ hosts: HttpHost[]; limits: HttpLimits }>('/http-hosts'),
  allowHost: (pattern: string, plainHttp = false) =>
    request<HttpHost>(`/http-hosts/${encodeURIComponent(pattern)}`, json('PUT', { plain_http: plainHttp })),
  denyHost: (pattern: string) => request<unknown>(`/http-hosts/${encodeURIComponent(pattern)}`, json('DELETE')),
  setHostSecret: (pattern: string, secret: { kind: 'query' | 'header'; name: string; value: string }) =>
    request<unknown>(`/http-hosts/${encodeURIComponent(pattern)}/secret`, json('PUT', secret)),
  clearHostSecret: (pattern: string) => request<unknown>(`/http-hosts/${encodeURIComponent(pattern)}/secret`, json('DELETE')),
  setHttpLimits: (patch: Partial<HttpLimits>) => request<HttpLimits>('/http-limits', json('PATCH', patch)),

  audit: (limit = 50, query: Omit<AuditQuery, 'limit'> = {}) => {
    const params = new URLSearchParams({ limit: String(limit) })
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v))
    return request<{ entries: AuditEntry[]; next?: number | null }>(`/audit?${params}`)
  },

  explainAs: (body: { text: string; channel: string; as_user?: string; badges: string[]; run: boolean; context?: string }) =>
    request<ExplainReport>('/explain', json('POST', { context: 'line', ...body })),
}

/** /readyz lives outside /api/v1, and answers 503 with the same body when something is down. */
export async function health(): Promise<Health> {
  const response = await fetch('/readyz', { headers: { accept: 'application/json' } })
  return (await response.json()) as Health
}

