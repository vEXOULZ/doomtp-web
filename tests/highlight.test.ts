import { describe, expect, it } from 'vitest'
import { highlight } from '../src/lib/highlight'

const kinds = (line: string, sign = '!') => highlight(line, sign).map((t) => `${t.kind}:${t.text}`)

describe('highlight', () => {
  it('colours the sign, commands, operators and placeholders', () => {
    expect(kinds('!random 1-100 | echo you rolled {1}!')).toEqual([
      'prefix:!', 'cmd:random', 'text: 1-100 ', 'op:|', 'text: ', 'cmd:echo', 'text: you rolled ', 'ph:{1}', 'text:!',
    ])
  })
  it('only counts operators standing alone', () => {
    expect(kinds('!echo (lol) ->')).toEqual(['prefix:!', 'cmd:echo', 'text: (lol) ->'])
  })
  it('a store target is not a command', () => {
    expect(kinds('!random 1-6 > chatter.luck')).toEqual(['prefix:!', 'cmd:random', 'text: 1-6 ', 'op:>', 'text: chatter.luck'])
  })
  it('keeps quoted strings together, and works with an emoji sign and a space after it', () => {
    expect(kinds('🏜 cc add hi "hello {x}"', '🏜')).toEqual(['prefix:🏜', 'text: ', 'cmd:cc', 'text: add hi ', 'str:"hello {x}"'])
  })
  it('a line inside a group or after && starts a new command, with or without its sign', () => {
    expect(kinds('( !a || default 5 )')).toEqual([
      'op:(', 'text: ', 'prefix:!', 'cmd:a', 'text: ', 'op:||', 'text: ', 'cmd:default', 'text: 5 ', 'op:)',
    ])
  })
})
