import { describe, expect, it } from 'vitest'
import type { Pack, Publication } from '../src/lib/api'
import { moduleRows, publishedRows } from '../src/lib/modules'

const cmd = (id: string, name: string) => ({ id, name, owner: 'alice', summary: null, body: '', version: 1, shareable: false })
const packs: Pack[] = [
  { name: 'games', summary: 'Little games', scope: 'global', commands: [cmd('c1', 'dice'), cmd('c2', 'coin')] },
]
const publications: Publication[] = [
  { ...cmd('c3', 'hype'), published_as: 'hype', status: 'active', required_role: null },
  { ...cmd('c1', 'dice'), published_as: 'dice', status: 'active', required_role: null },
]
const modules = [
  { module: 'core', enabled: true, toggleable: false },
  { module: 'quotes', enabled: false, toggleable: true },
]
const commands = [
  { name: 'quote', module: 'quotes', summary: null, enabled: false },
  { name: 'ping', module: 'core', summary: null, enabled: true },
]

describe('moduleRows', () => {
  const rows = moduleRows(modules, commands, packs, publications)
  it('lists built-in modules with the commands they cover', () => {
    expect(rows.find((r) => r.name === 'quotes')).toMatchObject({ kind: 'builtin', commands: ['quote'], enabled: false })
    expect(rows.find((r) => r.name === 'core')).toMatchObject({ toggleable: false })
  })
  it('adds packs, with no state until the bot reports one', () => {
    expect(rows.find((r) => r.name === 'games')).toMatchObject({ kind: 'pack', scope: 'global', commands: ['coin', 'dice'], enabled: null })
    const reported = moduleRows([...modules, { module: 'games', enabled: false, toggleable: true }], commands, packs, publications)
    expect(reported.filter((r) => r.name === 'games')).toEqual([expect.objectContaining({ kind: 'pack', enabled: false })])
  })
  it('puts commands published on their own under custom', () => {
    expect(rows.find((r) => r.name === 'custom')).toMatchObject({ kind: 'custom', commands: ['hype'] })
  })
})

describe('publishedRows', () => {
  it('names the module each command turns on and off with, once each', () => {
    expect(publishedRows(packs, publications).map((r) => [r.name, r.module])).toEqual([
      ['coin', 'games'],
      ['dice', 'games'],
      ['hype', 'custom'],
    ])
  })
})
