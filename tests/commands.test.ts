import { describe, expect, it } from 'vitest'
import type { Builtin, CustomCommand, Pack, Publication } from '../src/lib/api'
import { channelRows, filterRows, referenceRows } from '../src/lib/commands'

const spec = (over: Partial<Builtin> = {}): Builtin => ({
  name: 'random', module: 'fun', aliases: ['rng'], summary: 'Roll a number', description: 'Roll a number',
  usage: 'random <range>', required_role: 'everyone', input: 'none', params: [], default_cooldowns: {},
  examples: [{ invocation: '🏜random 1-6', output: '4' }], ...over,
})
const custom = (name: string, over: Partial<CustomCommand> = {}): CustomCommand => ({
  id: `cc_${name}`, name, owner: 'alice', summary: null, body: `echo ${name}`, version: 2, shareable: true, ...over,
})

describe('command rows', () => {
  it('merges built-ins, global publications and global packs, sorted by module then name', () => {
    const packs: Pack[] = [{ name: 'games', summary: null, scope: 'global', commands: [custom('dice')] }]
    const rows = referenceRows([spec(), spec({ name: 'ping', module: 'core' })], [{ ...custom('hug'), published_as: 'hug' }], packs, '🏜')
    expect(rows.map((r) => `${r.module}/${r.name}/${r.kind}`)).toEqual([
      'core/ping/built-in', 'custom/hug/derived', 'fun/random/built-in', 'games/dice/derived',
    ])
    const random = rows.find((r) => r.name === 'random')!
    expect(random.description).toBe('') // same as the summary: not repeated
    expect(random.examples[0]!.invocation).toBe('🏜random 1-6')
    expect(rows.find((r) => r.name === 'hug')!.summary).toBe('custom command by @alice')
  })

  it('flags always-on and fixed-policy built-ins, and lists cooldowns', () => {
    const [row] = referenceRows([spec({ toggleable: false, fixed_policy: true, default_cooldowns: { everyone: { tier_s: 3, user_s: 10 } } })], [], [], '!')
    expect(row!.alwaysOn && row!.fixedPolicy).toBe(true)
    expect(row!.cooldowns).toEqual([{ role: 'everyone', shared: 3, personal: 10 }])
  })

  it('a channel page shows only active publications, under the name they were published as', () => {
    const pub = (name: string, status: string): Publication => ({ ...custom(name), published_as: `${name}2`, status, required_role: 'vip' })
    const rows = channelRows([pub('hype', 'active'), pub('old', 'disabled')], [])
    expect(rows.map((r) => [r.name, r.role])).toEqual([['hype2', 'vip']])
  })

  it('search needs every term, across name, module, author and body', () => {
    const rows = referenceRows([spec()], [], [{ name: 'games', summary: null, scope: 'global', commands: [custom('dice', { body: 'random 1-6' })] }], '!')
    expect(filterRows(rows, 'alice random').map((r) => r.name)).toEqual(['dice'])
    expect(filterRows(rows, '  ').length).toBe(2)
    expect(filterRows(rows, 'RNG').map((r) => r.name)).toEqual(['random'])
  })
})
