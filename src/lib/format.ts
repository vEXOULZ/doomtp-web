// Small formatters the Manage pages share.

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

/** A Twitch login as typed: trimmed, without a leading `@`. */
export const loginOf = (typed: string) => typed.trim().replace(/^@/, '')

/** `@login`, or the user id when the login isn't known. */
export const atName = (login: string | null | undefined, id: string) => (login ? `@${login}` : id)

const pad = (n: number) => String(n).padStart(2, '0')
/** A time → a `datetime-local` input's value, in the viewer's own zone. */
export function localInput(at: string | number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A time as "Oct 9, 2026, 3:41 PM", in the viewer's own zone. */
export const dateTime = (at: string | number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
