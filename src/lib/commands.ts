// One row of the command table, from a built-in or a custom command. The same table serves the command
// reference and the channel pages (as the bot's own pages did), so both kinds share one shape.
import type { Builtin, CustomCommand, Pack, Param, Publication } from './api'

export type RowKind = 'built-in' | 'derived' | 'published'

export interface CommandRow {
  key: string
  name: string
  /** What follows the sign: the name plus its arguments. */
  usage: string
  module: string
  kind: RowKind
  role: string
  summary: string
  description: string
  aliases: string[]
  params: Param[]
  examples: { invocation: string; output: string | null }[]
  cooldowns: { role: string; shared: number; personal: number }[]
  alwaysOn: boolean
  fixedPolicy: boolean
  owner: string
  version: number
  body: string
  /** Everything the search box matches, lowercased once. */
  search: string
}

/** Spec text writes the command sign as `{sign}` (the bot fills in its default); show the one given instead. */
export function withSign(text: string, from: string, to: string): string {
  return from === to ? text : text.split(from).join(to)
}

export function builtinRow(spec: Builtin, defaultPrefix: string, prefix = defaultPrefix): CommandRow {
  const summary = withSign(spec.summary, defaultPrefix, prefix)
  const description = spec.description !== spec.summary ? withSign(spec.description, defaultPrefix, prefix) : ''
  return {
    key: `builtin:${spec.name}`,
    name: spec.name,
    usage: spec.usage,
    module: spec.module,
    kind: 'built-in',
    role: spec.required_role,
    summary,
    description,
    aliases: spec.aliases,
    params: spec.params,
    examples: spec.examples.map((e) => ({ invocation: withSign(e.invocation, defaultPrefix, prefix), output: e.output })),
    cooldowns: Object.entries(spec.default_cooldowns).map(([role, c]) => ({ role, shared: c.tier_s, personal: c.user_s })),
    alwaysOn: spec.toggleable === false,
    fixedPolicy: spec.fixed_policy === true,
    owner: '',
    version: 0,
    body: '',
    search: [spec.name, ...spec.aliases, spec.module, summary].join(' ').toLowerCase(),
  }
}

export function customRow(name: string, command: CustomCommand, module: string, kind: RowKind, role = 'everyone'): CommandRow {
  const summary = command.summary || `custom command by @${command.owner}`
  return {
    key: `${kind}:${module}:${name}`,
    name,
    usage: name,
    module,
    kind,
    role,
    summary,
    description: '',
    aliases: [],
    params: command.params ?? [],
    examples: [],
    cooldowns: [],
    alwaysOn: false,
    fixedPolicy: false,
    owner: command.owner,
    version: command.version,
    body: command.body,
    search: [name, module, summary, command.owner, command.body].join(' ').toLowerCase(),
  }
}

const byModuleThenName = (a: CommandRow, b: CommandRow) =>
  a.module.localeCompare(b.module) || a.name.localeCompare(b.name)

/** The command reference: every built-in, plus what is published for every channel (ADR-0012). */
export function referenceRows(
  builtins: Builtin[],
  global: (CustomCommand & { published_as: string })[],
  packs: Pack[],
  defaultPrefix: string,
): CommandRow[] {
  return [
    ...builtins.map((b) => builtinRow(b, defaultPrefix)),
    ...global.map((c) => customRow(c.published_as, c, 'custom', 'derived')),
    ...packs.flatMap((p) => p.commands.map((c) => customRow(c.name, c, p.name, 'derived'))),
  ].sort(byModuleThenName)
}

/** A channel page: what is published there, alone or in a pack (the channel's own packs and the global ones). */
export function channelRows(publications: Publication[], packs: Pack[]): CommandRow[] {
  return [
    ...publications
      .filter((p) => p.status === 'active')
      .map((p) => customRow(p.published_as, p, 'custom', 'published', p.required_role ?? 'everyone')),
    ...packs.flatMap((p) => p.commands.map((c) => customRow(c.name, c, p.name, 'published'))),
  ].sort(byModuleThenName)
}

/** Rows matching every whitespace-separated term. */
export function filterRows(rows: CommandRow[], query: string): CommandRow[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return terms.length ? rows.filter((r) => terms.every((t) => r.search.includes(t))) : rows
}
