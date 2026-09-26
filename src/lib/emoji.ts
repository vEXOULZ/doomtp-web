// The emoji the bot ships Twemoji art for (its /static/emoji), as the bot's own pages draw them. The command
// sign is an emoji, and some platforms draw 🏜 as a flat monochrome glyph, a poor thing to hand somebody as
// "the character you type". The image keeps the character as its alt, so copying still copies text.

const VARIATION_SELECTOR = '\u{FE0F}'
// Named after their codepoints, the way Twemoji names its files.
const AVAILABLE: Record<string, string> = { '🏜': '/static/emoji/1f3dc.svg' }
const PATTERN = new RegExp(`(${Object.keys(AVAILABLE).map((c) => `${c}${VARIATION_SELECTOR}?`).join('|')})`, 'u')

export type Piece = { text: string } | { emoji: string; src: string }

/** Text split into plain runs and the emoji we have art for. */
export function emojiPieces(text: string): Piece[] {
  return text
    .split(PATTERN)
    .filter(Boolean)
    .map((part) => {
      const character = part.replace(VARIATION_SELECTOR, '')
      const src = AVAILABLE[character]
      return src ? { emoji: character, src } : { text: part }
    })
}
