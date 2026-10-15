import { describe, expect, it } from 'vitest'
import { conditions, cooldowns, every, matches } from '../src/lib/triggers'

describe('how a trigger reads in a list', () => {
  it('says what sets it off', () => {
    expect(matches({ match: { regex: '^hi' }, schedule: {} })).toBe('^hi')
    expect(matches({ match: {}, schedule: { cron: '0 18 * * fri' } })).toBe('0 18 * * fri')
    expect(matches({ match: {}, schedule: { every_s: 1800 } })).toBe('every 30m')
    expect(matches({ match: {}, schedule: {} })).toBe('')
  })
  it('names its conditions and cooldowns', () => {
    expect(conditions({ match: {}, schedule: { only_live: true, min_chat_lines: 5 } })).toBe('only live · 5+ lines')
    expect(cooldowns({ cooldown_s: 30, user_cooldown_s: 7200 })).toBe('30s cooldown · 2h per chatter')
    expect(cooldowns({ cooldown_s: 0 })).toBe('')
    expect(every(90)).toBe('90s')
  })
})
