// The bot's JSON API (doomtp-bot, /api/v1, and /api/v2 for the audit), served on this site's origin. Only the parts these pages read.
// Fields are added on the bot's side, never renamed (ADR-0016), so optional ones here are the newer ones.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds, from Retry-After (a rate-limited login). */
    readonly retryAfter: number | null = null,
  ) {
    super(message)
  }
}

/** The text to show for a caught error. */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** A request whose answer doesn't change while the page is open (the bot's built-in catalogues): made once, and
 *  again only after a failure. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () =>
    (pending ??= load().catch((e: unknown) => {
      pending = undefined
      throw e
    }))
}

// Writes made with the admin cookie need the session's CSRF token (lib/session.ts sets it), and a 401 means
// the session is gone, which the session module hears about through `onUnauthorized`.
export const auth = {
  csrf: null as string | null,
  onUnauthorized: null as (() => void) | null,
  /** Why changes are refused right now (an admin viewing the site as someone else), or null. */
  blocks: null as (() => string | null) | null,
  /** Narrows a read the bot scoped to the caller to what a previewed role would get back (lib/session.ts). */
  scope: null as ((path: string, body: unknown) => unknown) | null,
}

/** Writes that change nothing (explain, and the trigger, filter and automod test boxes) or only end the session, and so
 *  still go through while changes are refused. */
const HARMLESS = (method: string, path: string) =>
  (method === 'POST' && (path === '/parse' || path.startsWith('/explain') || path.endsWith('/test'))) ||
  (method === 'DELETE' && path === '/session')

/** `unscoped`: the answer as the bot gave it, even while previewing (the "View as" picker's own reads). `v2`: from
 *  /api/v2 (ADR-0027), whose errors are problem details, with the message in `detail` as well. */
export async function request<T>(path: string, init: RequestInit = {}, { unscoped = false, v2 = false } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const method = (init.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && !HARMLESS(method, path)) {
    const blocked = auth.blocks?.()
    if (blocked) throw new ApiError(403, blocked)
  }
  if (method !== 'GET' && auth.csrf) headers.set('X-CSRF-Token', auth.csrf)
  let response: Response
  try {
    response = await fetch(`/api/${v2 ? 'v2' : 'v1'}${path}`, { credentials: 'same-origin', ...init, headers })
  } catch {
    throw new ApiError(0, "Couldn't reach the bot.")
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ') || detail
    } catch {
      /* not JSON: keep the status line */
    }
    if (response.status === 401) auth.onUnauthorized?.()
    const retry = Number(response.headers.get('retry-after'))
    throw new ApiError(response.status, detail, Number.isFinite(retry) && retry > 0 ? retry : null)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const body: unknown = text ? JSON.parse(text) : undefined
  return (method === 'GET' && !unscoped && auth.scope ? auth.scope(path, body) : body) as T
}

const get = <T>(path: string) => request<T>(path)

// ── site ──────────────────────────────────────────────────────────────────
export interface SiteChannel {
  login: string
  prefix: string
  tier: string
}
export interface Site {
  version: string
  syntax_version: string
  default_prefix: string
  admin_enabled: boolean
  channels: SiteChannel[]
}
export interface ChannelSummary extends SiteChannel {
  status: string
  active: boolean
  /** The channel's Twitch id (bots from before 0.8 leave it out). */
  channel_id?: string
}
export interface Role {
  name: string
  rank: number
}

// ── commands ──────────────────────────────────────────────────────────────
export interface Param {
  position: string
  name: string
  type: string
  required: boolean
  description: string
  choices?: string[]
}
export interface Builtin {
  name: string
  module: string
  aliases: string[]
  summary: string
  description: string
  usage: string
  required_role: string
  input: string
  params: Param[]
  examples: { invocation: string; output: string | null }[]
  default_cooldowns: Record<string, { tier_s: number; user_s: number }>
  toggleable?: boolean
  fixed_policy?: boolean
}
export interface CustomCommand {
  id: string
  name: string
  owner: string
  summary: string | null
  body: string
  version: number
  shareable: boolean
  params?: Param[]
}
export interface Pack {
  name: string
  summary: string | null
  scope: 'global' | 'channel'
  commands: CustomCommand[]
}
export interface Publication extends CustomCommand {
  published_as: string
  status: string
  required_role: string | null
  /** The version this channel last ran (null: never ran here). Absent from bots older than doomtp-bot#31. */
  last_run_version?: number | null
}

// ── language ──────────────────────────────────────────────────────────────
export interface Language {
  syntax_version: string
  operators: string[]
  roots: string[]
  types: string[]
  variable_namespaces: string[]
  limits: Record<string, number>
}
export interface Grammar {
  syntax_version: string
  text: string
  rules: { name: string; body: string }[]
}

// ── explain (spec §9) ─────────────────────────────────────────────────────
export interface ExplainPlaceholder {
  reference: string
  available: boolean
  has_fallback: boolean
}
export interface ExplainInvocation {
  index: number
  name: string
  source: string
  owner?: string | null
  version?: number | null
  required_role: string | null
  rank: number
  allowed: boolean
  reason: string | null
  cooldown_tier_s: number
  cooldown_user_s: number
  input_mode: string
  placeholders: ExplainPlaceholder[]
}
export interface ExplainReport {
  expression: string
  context: string
  channel?: string | null
  parse_error?: string | null
  ast?: string | null
  invocations: ExplainInvocation[]
  stores?: { variable: string; append: boolean; allowed: boolean }[]
  failure?: { message: string; code: number } | null
  failed_index?: number | null
  ran?: boolean
  result?: { code: number; message?: string } | null
  executed?: number[]
  would_send?: string | null
}

export const api = {
  site: () => get<Site>('/site'),
  channel: (login: string) => get<ChannelSummary>(`/site/channels/${encodeURIComponent(login)}`),
  roles: once(() => get<{ roles: Role[]; custom_rank_range: [number, number] }>('/roles')),
  commands: once(() => get<{ syntax_version: string; commands: Builtin[] }>('/commands')),
  language: once(() => get<Language>('/language')),
  grammar: once(() => get<Grammar>('/grammar')),
  packs: () => get<{ packs: Pack[] }>('/packs'),
  channelPacks: (login: string) => get<{ packs: Pack[] }>(`/channels/${encodeURIComponent(login)}/packs`),
  globalCommands: () => get<{ commands: (CustomCommand & { published_as: string })[] }>('/custom-commands'),
  publications: (login: string) =>
    get<{ publications: Publication[] }>(`/channels/${encodeURIComponent(login)}/publications`),
  explainReport: (token: string) => get<ExplainReport>(`/explain/${encodeURIComponent(token)}`),
}
