// The bot's JSON API (doomtp-bot, /api/v1), served on this site's origin. Only the parts these pages read.
// Fields are added on the bot's side, never renamed (ADR-0016), so optional ones here are the newer ones.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError(0, "Couldn't reach the bot.")
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* not JSON: keep the status line */
    }
    throw new ApiError(response.status, detail)
  }
  return (await response.json()) as T
}

const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

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
  roles: () => get<{ roles: Role[]; custom_rank_range: [number, number] }>('/roles'),
  commands: () => get<{ syntax_version: string; commands: Builtin[] }>('/commands'),
  language: () => get<Language>('/language'),
  grammar: () => get<Grammar>('/grammar'),
  packs: () => get<{ packs: Pack[] }>('/packs'),
  channelPacks: (login: string) => get<{ packs: Pack[] }>(`/channels/${encodeURIComponent(login)}/packs`),
  globalCommands: () => get<{ commands: (CustomCommand & { published_as: string })[] }>('/custom-commands'),
  publications: (login: string) =>
    get<{ publications: Publication[] }>(`/channels/${encodeURIComponent(login)}/publications`),
  explainReport: (token: string) => get<ExplainReport>(`/explain/${encodeURIComponent(token)}`),
  explain: (text: string, context = 'line') => post<ExplainReport>('/explain', { text, context }),
}
