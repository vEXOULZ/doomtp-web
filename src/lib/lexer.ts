// Colours command text with the bot's own lexer: the one its editor uses, published by the bot as an ES module at
// /static/editor/tokens.js on this origin (doomtp-bot web-editor/README.md). One lexer, so the pages and the editor
// can't colour the same line differently. Like the editor's, it only colours: the bot's parser decides validity.
import { shallowRef } from 'vue'

export interface Token {
  /** A token class of the bot's ADR-0011: prefix, command, operator, string, ph.root, store.target, … */
  t: string
  s: number
  e: number
}
export type Tokenize = (text: string, options?: { prefix?: string; context?: string }) => Token[]
/** `line` starts with the command sign (what chat types); `body` is a custom command's body, with no sign. */
export type LexContext = 'line' | 'body'

export interface Span {
  text: string
  /** `dtb-<class>`, the editor's own class names; none for the spaces between tokens. */
  cls?: string
}

const MODULE = '/static/editor/tokens.js'

/** The bot's tokenize(), once loaded. Until then (or if the bot is too old to have it) text stays plain. */
export const tokenizer = shallowRef<Tokenize | null>(null)
let loading: Promise<void> | null = null

export function loadLexer(): Promise<void> {
  loading ??= import(/* @vite-ignore */ MODULE).then(
    (module: { tokenize: Tokenize }) => {
      tokenizer.value = module.tokenize
    },
    () => {
      loading = null // try again on the next page
    },
  )
  return loading
}

/** The sign a chat line starts with, when the page doesn't know the channel's: everything before the first letter,
 * digit, `@` or space (`!`, `🏜`, `?!`). Only for colours; the bot knows the real one. */
export function leadingSign(line: string): string {
  return /^[^\p{L}\p{N}@\s]*/u.exec(line)?.[0] ?? ''
}

/** Text cut into coloured spans. Whatever the tokens don't cover (spaces) stays plain, so nothing is lost. */
export function spans(text: string, tokenize: Tokenize | null, options: { prefix: string; context: LexContext }): Span[] {
  if (!tokenize || !text) return [{ text }]
  const out: Span[] = []
  let at = 0
  for (const { t, s, e } of tokenize(text, options)) {
    if (s < at || e <= s) continue // overlapping or empty: skip rather than duplicate text
    if (s > at) out.push({ text: text.slice(at, s) })
    out.push({ text: text.slice(s, e), cls: `dtb-${t.replace(/\./g, '-')}` })
    at = e
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}
