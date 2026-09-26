// A channel's modules as one list: the built-in ones with the commands they cover, and the packs published here
// (a pack's name doubles as its module name, so `module disable <pack>` turns the whole pack off). Custom commands
// published one by one share the `custom` module.
import type { Module } from './admin'
import type { Builtin, Pack, Publication } from './api'

export interface ChannelCommand {
  name: string
  module: string
  summary: string | null
  enabled: boolean
  /** The least role that may run it here: this channel's rule, else the bot-wide one, else the command's own. */
  required_role?: string
  /** When set, exactly these roles may run it instead. */
  allowed_roles?: string[] | null
  cooldowns?: Record<string, { tier_s: number; user_s: number }>
  /** Twitch permissions it needs, and those the bot doesn't have here. */
  requires?: string[]
  missing?: string[]
}

export interface CommandRow extends ChannelCommand {
  /** False: always on, no channel can turn it off. */
  toggleable: boolean
  /** No role and no cooldown to configure (the sentinel commands). */
  fixedPolicy: boolean
}

/**
 * A channel's commands with what the bot's reference says can be changed about each, by name. A command the
 * reference doesn't list counts as changeable: the bot refuses what it must.
 */
export function commandRows(commands: ChannelCommand[], builtins: Pick<Builtin, 'name' | 'toggleable' | 'fixed_policy'>[]): CommandRow[] {
  const byName = new Map(builtins.map((b) => [b.name, b]))
  return commands
    .map((c) => ({ ...c, toggleable: byName.get(c.name)?.toggleable ?? true, fixedPolicy: byName.get(c.name)?.fixed_policy ?? false }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const LOG_LEVELS = ['off', 'errors', 'output', 'invocations', 'all'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

/**
 * A change to one command's rules here. `null` drops this channel's own setting, so the bot-wide one (or the
 * command's default) applies again; a field left out stays as it is.
 */
export interface CommandRulePatch {
  enabled?: boolean | null
  required_role?: string | null
  log_level?: LogLevel
}

export interface ModuleRow {
  name: string
  kind: 'builtin' | 'pack' | 'custom'
  /** Packs: published for this channel only, or for every channel. */
  scope?: 'channel' | 'global'
  summary: string | null
  owners: string[]
  commands: string[]
  /** null when the bot doesn't report whether it is on (it reports built-in modules only, for now). */
  enabled: boolean | null
  toggleable: boolean
}

export interface PublishedRow {
  name: string
  module: string
  owner: string
  summary: string | null
  version: number
  /** A publication's own state (active, disabled, orphaned); commands in a pack follow the pack. */
  status: string
}

export const CUSTOM_MODULE = 'custom'

const uniq = (xs: string[]) => [...new Set(xs)].sort()

export function moduleRows(modules: Module[], commands: ChannelCommand[], packs: Pack[], publications: Publication[]): ModuleRow[] {
  const known = new Map(modules.map((m) => [m.module, m]))
  const state = (name: string) => known.get(name)?.enabled ?? null
  const rows: ModuleRow[] = modules
    .filter((m) => m.module !== CUSTOM_MODULE && !packs.some((p) => p.name === m.module))
    .map((m) => ({
      name: m.module,
      kind: 'builtin',
      summary: null,
      owners: [],
      commands: commands.filter((c) => c.module === m.module).map((c) => c.name).sort(),
      enabled: m.enabled,
      toggleable: m.toggleable,
    }))
  for (const p of packs) {
    rows.push({
      name: p.name,
      kind: 'pack',
      scope: p.scope,
      summary: p.summary,
      owners: uniq(p.commands.map((c) => c.owner)),
      commands: p.commands.map((c) => c.name).sort(),
      enabled: state(p.name),
      toggleable: true,
    })
  }
  const loose = looseOnes(packs, publications)
  if (loose.length || known.has(CUSTOM_MODULE)) {
    rows.push({
      name: CUSTOM_MODULE,
      kind: 'custom',
      summary: 'Custom commands published here one by one',
      owners: uniq(loose.map((p) => p.owner)),
      commands: loose.map((p) => p.published_as).sort(),
      enabled: state(CUSTOM_MODULE),
      toggleable: true,
    })
  }
  return rows
}

/** Publications that aren't also a member of a pack published here. */
function looseOnes(packs: Pack[], publications: Publication[]) {
  const inPacks = new Set(packs.flatMap((p) => p.commands.map((c) => c.id)))
  return publications.filter((p) => !inPacks.has(p.id))
}

/** Every custom command chat can run here, with the module that turns it on and off. */
export function publishedRows(packs: Pack[], publications: Publication[]): PublishedRow[] {
  const rows: PublishedRow[] = []
  for (const p of packs) {
    for (const c of p.commands) {
      rows.push({ name: c.name, module: p.name, owner: c.owner, summary: c.summary, version: c.version, status: 'active' })
    }
  }
  for (const p of looseOnes(packs, publications)) {
    rows.push({ name: p.published_as, module: CUSTOM_MODULE, owner: p.owner, summary: p.summary, version: p.version, status: p.status })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}
