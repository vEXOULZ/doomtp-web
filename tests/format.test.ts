import { describe, expect, it } from 'vitest'
import { bytes, count, shown } from '../src/lib/format'

describe('bytes', () => {
  it('keeps small sizes in bytes and rounds larger ones', () => {
    expect(bytes(0)).toBe('0 B')
    expect(bytes(1023)).toBe('1023 B')
    expect(bytes(1024)).toBe('1 KB')
    expect(bytes(1536)).toBe('1.5 KB')
    expect(bytes(50 * 1024)).toBe('50 KB')
    expect(bytes(3 * 1024 * 1024)).toBe('3 MB')
    expect(bytes(5 * 1024 ** 4)).toBe('5120 GB')
  })
})

describe('shown', () => {
  it('shows strings as they are and anything else as JSON', () => {
    expect(shown('hi')).toBe('hi')
    expect(shown(3)).toBe('3')
    expect(shown([1, 'a'])).toBe('[1,"a"]')
    expect(shown(null)).toBe('null')
    expect(shown(undefined)).toBe('')
  })
})

describe('count', () => {
  it('reads whole numbers from a text or number field', () => {
    expect(count('150')).toBe(150)
    expect(count(' 7 ')).toBe(7)
    expect(count(0)).toBe(0)
    expect(count('')).toBeNull()
    expect(count('1.5')).toBeNull()
    expect(count('-3')).toBeNull()
  })
})
