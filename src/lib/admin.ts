// The managing half of the bot's JSON API (ADR-0016, ADR-0026): the session, a channel's settings and logs, and
// the bot's own. Every call needs the session cookie; writes also send its CSRF token (see `auth` in api.ts).
import type { ChannelCommand, CommandRulePatch } from './modules'
import type { AuditOut } from '@vexoulz/platform-web'
import type { LogCoverage, LogEntry, LogQuery } from '@vexoulz/platform-web/chat'
import { request, type CustomCommand, type ExplainReport, type Publication } from './api'

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
  /** Filled in by bots after 0.4.0: the login of `updated_by`, when known. */
  updated_by_login?: string | null
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

// The log's shapes (/api/v2/channels/{login}/log, ADR-0027) are the shared chat library's.
export type { LogCoverage, LogEntry, LogQuery, LogUser } from '@vexoulz/platform-web/chat'

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
/** A row of the bot's audit log, as /api/v2/audit serves it (ADR-0027): a change, or a write it refused. */
export type AuditEntry = AuditOut
export interface AuditQuery {
  limit?: number
  /** A channel id. */
  scope?: string
  /** A login, or `me`. */
  actor?: string
  /** `cc.edit`, or `cc.` for every cc one. */
  action?: string
  /** The `next_cursor` of the page before. */
  cursor?: string
}
export interface AuditPage {
  items: AuditEntry[]
  next_cursor: string | null
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

  channels: (unscoped = false) => request<{ channels: Channel[] }>('/channels', {}, { unscoped }),
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
  /** The channel's log as one timeline (/api/v2), newest first unless `order` says; pass `next_cursor` back as
   *  `cursor`, with the same filters, for the page after. */
  log: (login: string, query: LogQuery = {}) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) for (const one of v) params.append(k, one)
      else if (v !== undefined && v !== '' && v !== false) params.set(k, String(v))
    }
    return request<{ items: LogEntry[]; next_cursor: string | null }>(`${at(login)}/log?${params}`, {}, { v2: true })
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
    return request<AuditPage>(`/audit?${params}`, {}, { v2: true })
  },

  explainAs: (body: { text: string; channel: string; as_user?: string; badges: string[]; run: boolean; context?: string }) =>
    request<ExplainReport>('/explain', json('POST', { context: 'line', ...body })),

  // a channel's own things, as chat manages them (ADR-0026)
  resetModule: (login: string, module: string) =>
    request<unknown>(`${at(login)}/modules/${encodeURIComponent(module)}`, json('DELETE')),
  resetCommand: (login: string, name: string) =>
    request<unknown>(`${at(login)}/commands/${encodeURIComponent(name)}`, json('DELETE')),
  editTrigger: (login: string, id: number, patch: TriggerPatch) =>
    request<Trigger>(`${at(login)}/triggers/${id}`, json('PATCH', patch)),
  testTriggers: (login: string, text: string) =>
    request<{ matches: { trigger: Trigger; fields: Record<string, unknown> }[] }>(`${at(login)}/triggers/test`, json('POST', { text })),
  editFilter: (login: string, id: number, patch: FilterPatch) =>
    request<FilterEntry>(`${at(login)}/filters/${id}`, json('PATCH', patch)),
  testFilter: (login: string, text: string) => request<FilterTest>(`${at(login)}/filters/test`, json('POST', { text })),
  setVariable: (login: string, name: string, value: unknown) =>
    request<unknown>(`${at(login)}/variables/${encodeURIComponent(name)}`, json('PUT', { value })),
  deleteVariable: (login: string, name: string) =>
    request<unknown>(`${at(login)}/variables/${encodeURIComponent(name)}`, json('DELETE')),

  roles: (login: string, unscoped = false) => request<ChannelRoles>(`${at(login)}/roles`, {}, { unscoped }),
  createRole: (login: string, name: string, rank: number) => request<unknown>(`${at(login)}/roles`, json('POST', { name, rank })),
  deleteRole: (login: string, name: string) => request<unknown>(`${at(login)}/roles/${encodeURIComponent(name)}`, json('DELETE')),
  /** `durationS` from a minute to 366 days; left out, until removed. */
  grantRole: (login: string, role: string, user: string, durationS?: number) =>
    request<unknown>(
      `${at(login)}/roles/${encodeURIComponent(role)}/members/${encodeURIComponent(user)}`,
      json('PUT', durationS ? { duration_s: durationS } : {}),
    ),
  revokeRole: (login: string, role: string, user: string) =>
    request<unknown>(`${at(login)}/roles/${encodeURIComponent(role)}/members/${encodeURIComponent(user)}`, json('DELETE')),

  callbacks: (login: string) => request<{ callbacks: Callback[] }>(`${at(login)}/callbacks`),
  setCallback: (login: string, kind: string, scope: string, expr: string) =>
    request<unknown>(`${at(login)}/callbacks/${encodeURIComponent(kind)}/${encodeURIComponent(scope)}`, json('PUT', { expr })),
  deleteCallback: (login: string, kind: string, scope: string) =>
    request<unknown>(`${at(login)}/callbacks/${encodeURIComponent(kind)}/${encodeURIComponent(scope)}`, json('DELETE')),
  customecho: (login: string) => request<{ customecho: { command: string; template: string }[] }>(`${at(login)}/customecho`),
  setCustomecho: (login: string, name: string, text: string) =>
    request<unknown>(`${at(login)}/customecho/${encodeURIComponent(name)}`, json('PUT', { text })),
  deleteCustomecho: (login: string, name: string) =>
    request<unknown>(`${at(login)}/customecho/${encodeURIComponent(name)}`, json('DELETE')),

  publish: (login: string, command: string, name?: string) =>
    request<{ needs_grants?: Record<string, string[]> }>(`${at(login)}/publications`, json('POST', { command, name: name || undefined })),
  unpublish: (login: string, name: string) =>
    request<unknown>(`${at(login)}/publications/${encodeURIComponent(name)}`, json('DELETE')),
  publishPack: (login: string, pack: string, owner?: string) =>
    request<unknown>(`${at(login)}/packs`, json('POST', { pack, owner: owner || undefined })),
  unpublishPack: (login: string, name: string, owner?: string) =>
    request<unknown>(`${at(login)}/packs/${encodeURIComponent(name)}${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`, json('DELETE')),
  grants: (login: string) => request<{ grants: Grant[] }>(`${at(login)}/grants`),
  grant: (login: string, name: string, variable: string) =>
    request<unknown>(`${at(login)}/grants/${encodeURIComponent(name)}/${encodeURIComponent(variable)}`, json('PUT')),
  ungrant: (login: string, name: string, variable: string) =>
    request<unknown>(`${at(login)}/grants/${encodeURIComponent(name)}/${encodeURIComponent(variable)}`, json('DELETE')),

  backfill: (login: string, limit = 20) => request<{ enabled: boolean; jobs: BackfillJob[] }>(`${at(login)}/backfill?limit=${limit}`),
  /** Fetch what the log is missing (`gaps`), or one time range. */
  startBackfill: (login: string, body: { gaps: true } | { from_ms?: number; to_ms?: number }) =>
    request<unknown>(`${at(login)}/backfill`, json('POST', body)),
  cancelBackfill: (login: string, id: number) => request<unknown>(`${at(login)}/backfill/${id}`, json('DELETE')),
  /** When the bot was listening between `since` and `until` (now by default, both ISO 8601), the holes in between and
   *  what backfill made of each. */
  coverage: (login: string, since: string, until?: string) => {
    const params = new URLSearchParams({ since, ...(until ? { until } : {}) })
    return request<LogCoverage>(`${at(login)}/log/coverage?${params}`, {}, { v2: true })
  },
  probe: (login: string) => request<{ login: string; capabilities: string[] }>(`${at(login)}/capabilities/probe`, json('POST')),

  // yours, wherever you are
  myCommands: () => request<MyCommands>('/me/custom-commands'),
  createCommand: (body: { name: string; body: string; summary?: string; channel: string }) =>
    request<MyCommand>('/me/custom-commands', json('POST', body)),
  editCommand: (name: string, patch: { body?: string; summary?: string; shareable?: boolean; channel?: string }) =>
    request<MyCommand>(`/me/custom-commands/${encodeURIComponent(name)}`, json('PATCH', patch)),
  deleteCommand: (name: string) =>
    request<{ name: string; removed: boolean; links: number; publications: number }>(`/me/custom-commands/${encodeURIComponent(name)}`, json('DELETE')),
  commandVersions: (name: string) =>
    request<{ name: string; current: number; versions: { version: number; body: string; created_at: number }[] }>(
      `/me/custom-commands/${encodeURIComponent(name)}/versions`,
    ),
  revertCommand: (name: string, version: number) =>
    request<MyCommand>(`/me/custom-commands/${encodeURIComponent(name)}/revert`, json('POST', { version })),
  setParam: (name: string, position: string, param: ParamBody) =>
    request<unknown>(`/me/custom-commands/${encodeURIComponent(name)}/params/${encodeURIComponent(position)}`, json('PUT', param)),
  deleteParam: (name: string, position: string) =>
    request<unknown>(`/me/custom-commands/${encodeURIComponent(name)}/params/${encodeURIComponent(position)}`, json('DELETE')),
  /** Your alias for someone's shared command (`owner`), or for one a channel published (`channel`). */
  link: (alias: string, body: { command: string; owner?: string; channel?: string }) =>
    request<unknown>(`/me/links/${encodeURIComponent(alias)}`, json('PUT', body)),
  unlink: (alias: string) => request<unknown>(`/me/links/${encodeURIComponent(alias)}`, json('DELETE')),
  myPacks: () => request<{ packs: MyPack[] }>('/me/packs'),
  createPack: (name: string, summary: string) => request<unknown>('/me/packs', json('POST', { name, summary })),
  sharePack: (name: string, shareable: boolean) => request<unknown>(`/me/packs/${encodeURIComponent(name)}`, json('PATCH', { shareable })),
  deletePack: (name: string) => request<unknown>(`/me/packs/${encodeURIComponent(name)}`, json('DELETE')),
  addToPack: (pack: string, command: string, internal = false) =>
    request<unknown>(`/me/packs/${encodeURIComponent(pack)}/commands/${encodeURIComponent(command)}`, json('PUT', { internal })),
  removeFromPack: (pack: string, command: string) =>
    request<unknown>(`/me/packs/${encodeURIComponent(pack)}/commands/${encodeURIComponent(command)}`, json('DELETE')),
  myVariables: () => request<{ variables: MyVariable[] }>('/me/variables'),
  myRuns: (limit = 50) => request<{ runs: MyRun[] }>(`/me/runs?limit=${limit}`),

  // the bot itself
  admins: () => request<{ owners: AdminUser[]; admins: AdminUser[]; you_manage: boolean }>('/admins'),
  addAdmin: (login: string) => request<unknown>('/admins', json('POST', { login })),
  removeAdmin: (userId: string) => request<unknown>(`/admins/${encodeURIComponent(userId)}`, json('DELETE')),
  globalModules: () => request<{ modules: GlobalModule[] }>('/global/modules'),
  setGlobalModule: (module: string, enabled: boolean) =>
    request<unknown>(`/global/modules/${encodeURIComponent(module)}`, json('PUT', { enabled })),
  resetGlobalModule: (module: string) => request<unknown>(`/global/modules/${encodeURIComponent(module)}`, json('DELETE')),
  globalCommands: () => request<{ commands: GlobalCommand[] }>('/global/commands'),
  setGlobalCommand: (name: string, patch: CommandRulePatch) =>
    request<unknown>(`/global/commands/${encodeURIComponent(name)}`, json('PATCH', patch)),
  resetGlobalCommand: (name: string) => request<unknown>(`/global/commands/${encodeURIComponent(name)}`, json('DELETE')),
  globalFilters: () => request<{ filters: FilterEntry[] }>('/global/filters'),
  addGlobalFilter: (body: FilterBody) => request<FilterEntry>('/global/filters', json('POST', body)),
  editGlobalFilter: (id: number, patch: FilterPatch) => request<FilterEntry>(`/global/filters/${id}`, json('PATCH', patch)),
  deleteGlobalFilter: (id: number) => request<unknown>(`/global/filters/${id}`, json('DELETE')),
  ignoredEverywhere: () => request<{ ignored: IgnoredRaw[] }>('/ignored'),
  publishGlobal: (command: string, name?: string) =>
    request<unknown>('/global/publications', json('POST', { command, name: name || undefined })),
  unpublishGlobal: (name: string) => request<unknown>(`/global/publications/${encodeURIComponent(name)}`, json('DELETE')),
  publishGlobalPack: (pack: string, owner?: string) =>
    request<unknown>('/global/packs', json('POST', { pack, owner: owner || undefined })),
  unpublishGlobalPack: (name: string, owner?: string) =>
    request<unknown>(`/global/packs/${encodeURIComponent(name)}${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`, json('DELETE')),
}

export interface TriggerPatch {
  enabled?: boolean
  expr?: string
  match?: Record<string, unknown>
  schedule?: Record<string, unknown>
  run_as_rank?: number
  log_level?: string
}
export interface FilterBody {
  pattern: string
  kind: string
  action: string
  category?: string
  replacement?: string
}
export type FilterPatch = Partial<FilterBody & { enabled: boolean }>
export interface FilterTest {
  /** The text after any replacements. */
  text: string
  blocked: boolean
  /** Whether a replacement applied. */
  changed: boolean
  patterns: string[]
  /** What automod would do, or null for nothing. */
  automod: { action: string; seconds?: number } | null
  automod_able: boolean
}
export interface RoleMember {
  user_id: string
  login: string | null
  expires_at: number | null
}
export interface ChannelRoles {
  builtin: { name: string; rank: number }[]
  roles: { name: string; rank: number; global: boolean; manageable: boolean; members: RoleMember[] }[]
  your_rank: number
}
export const CALLBACK_KINDS = ['on_cooldown', 'on_denied'] as const
export interface Callback {
  /** `channel`, `module:<name>` or `command:<name>`. */
  scope: string
  kind: string
  expr: string
}
export interface Grant {
  name: string
  id: string
  owner: string
  /** The variables the command writes, and which of them this channel lets it. */
  writes: string[]
  granted: string[]
}
export interface BackfillJob {
  id: number
  from_ms: number
  to_ms: number
  requested_by: string
  requested_at: number
  /** queued, running, done, failed or cancelled. */
  state: string
  started_at: number | null
  finished_at: number | null
  fetched: number
  inserted: number
  complete: boolean | null
  error: string | null
}
export interface ParamBody {
  name: string
  type?: string
  required?: boolean
  default?: string
  min?: number
  max?: number
  max_len?: number
  choices?: string[]
  description: string
}
export interface MyCommand extends CustomCommand {
  links?: number
  publications?: { channel: string; name: string; status: string }[]
}
export interface MyCommands {
  commands: MyCommand[]
  linked: (CustomCommand & { alias: string })[]
  quota?: unknown
}
export interface MyPack {
  id: string
  name: string
  summary: string | null
  system: boolean
  commands: { name: string; internal: boolean; shareable: boolean }[]
  shareable: boolean
  /** Channel logins, or `global`. */
  published: string[]
}
export interface MyVariable {
  namespace: string
  name: string
  channel: string | null
  keys?: string[] | null
  value: unknown
  updated_at: number | null
  updated_by: string | null
}
export interface MyRun extends Omit<Run, 'user_id'> {
  channel_id: string
  channel: string | null
}
export interface AdminUser {
  user_id: string
  login: string | null
}
export interface GlobalModule {
  module: string
  enabled: boolean | null
  toggleable: boolean
  kind?: string
}
export interface GlobalCommand {
  name: string
  module: string
  summary: string | null
  enabled: boolean | null
  toggleable: boolean
  fixed_policy: boolean
  required_role: string | null
  allowed_roles: string[] | null
  cooldowns: Record<string, { tier_s: number; user_s: number }> | null
  log_level: string | null
}

/** /readyz lives outside /api/v1, and answers 503 with the same body when something is down. */
export async function health(): Promise<Health> {
  const response = await fetch('/readyz', { headers: { accept: 'application/json' } })
  return (await response.json()) as Health
}

