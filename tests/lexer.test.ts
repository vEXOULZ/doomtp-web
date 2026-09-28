import { describe, expect, it } from 'vitest'
import { leadingSign, spans, type Tokenize } from '../src/lib/lexer'

// Stands in for the bot's tokenize() (/static/editor/tokens.js): whitespace is never a token, as there.
const fake: Tokenize = (text) => {
  const out = []
  for (const m of text.matchAll(/\S+/g)) {
    const word = m[0]
    const t = m.index === 0 ? 'command' : word === '|' ? 'operator' : word.startsWith('{') ? 'ph.root' : 'word'
    out.push({ t, s: m.index!, e: m.index! + word.length })
  }
  return out
}

describe('spans', () => {
  it('keeps every character, colouring tokens and leaving spaces plain', () => {
    const out = spans('echo a | {_1}', fake, { prefix: '!', context: 'body' })
    expect(out.map((s) => s.text).join('')).toBe('echo a | {_1}')
    expect(out.filter((s) => s.cls).map((s) => `${s.cls}:${s.text}`)).toEqual([
      'dtb-command:echo', 'dtb-word:a', 'dtb-operator:|', 'dtb-ph-root:{_1}',
    ])
  })
  it('is plain text until the lexer has loaded', () => {
    expect(spans('!ping', null, { prefix: '!', context: 'line' })).toEqual([{ text: '!ping' }])
  })
  it('skips overlapping tokens instead of repeating text', () => {
    const overlapping: Tokenize = () => [{ t: 'word', s: 0, e: 3 }, { t: 'word', s: 1, e: 2 }]
    expect(spans('abcd', overlapping, { prefix: '!', context: 'line' }).map((s) => s.text).join('')).toBe('abcd')
  })
})

describe('leadingSign', () => {
  it('takes what comes before the command name', () => {
    expect(leadingSign('!role list')).toBe('!')
    expect(leadingSign('🏜 ping')).toBe('🏜')
    expect(leadingSign('?!help')).toBe('?!')
    expect(leadingSign('echo hi')).toBe('')
    expect(leadingSign('@mine')).toBe('')
  })
})
