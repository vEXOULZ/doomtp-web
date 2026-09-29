// Small formatters the Manage pages share.

/** 1536 → "1.5 KB". */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let value = n / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${units[unit]}`
}

/** A whole number of 0 or more typed in a field (a number field's model is a number, others a string), else null. */
export function count(raw: string | number): number | null {
  const text = String(raw).trim()
  return /^\d+$/.test(text) ? Number(text) : null
}

/** A stored value as one line: strings as they are, anything else as JSON. */
export function shown(value: unknown): string {
  if (typeof value === 'string') return value
  return value === undefined ? '' : JSON.stringify(value)
}

/** What someone typed as a variable's value: JSON when it reads as JSON (`3`, `true`, `[1,2]`, `"x"`), else the text. */
export function typedValue(text: string): unknown {
  const t = text.trim()
  if (!t) return ''
  try {
    return JSON.parse(t)
  } catch {
    return text
  }
}

/** Seconds as the largest whole unit: 90 → "90s", 3600 → "1h", 86400 → "1d". */
export function span(seconds: number): string {
  for (const [unit, size] of [['d', 86400], ['h', 3600], ['m', 60]] as const) {
    if (seconds >= size && seconds % size === 0) return `${seconds / size}${unit}`
  }
  return `${seconds}s`
}
