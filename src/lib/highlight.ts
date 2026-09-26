// Colours a chat line for display, the way the lab's code blocks do: the sign, command names, operators,
// placeholders and quoted strings. Display only: the bot's parser decides what a line means (the language
// page's editor asks it), so anything this gets wrong is only a colour.

export type TokenKind = 'prefix' | 'cmd' | 'op' | 'ph' | 'str' | 'text'
export interface Token {
  kind: TokenKind
  text: string
}

// Operators count only when they stand alone between spaces (so "(lol)" stays chat); longest first.
const OPERATORS = ['||', '&&', '>>', '|', '>', '(', ')']

export function highlight(line: string, sign: string): Token[] {
  const out: Token[] = []
  const push = (kind: TokenKind, text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind && kind === 'text') last.text += text
    else if (text) out.push({ kind, text })
  }
  let i = 0
  let expectCommand = false
  if (sign && line.startsWith(sign)) {
    push('prefix', sign)
    i = sign.length
    expectCommand = true
  }
  while (i < line.length) {
    const ch = line[i]!
    if (ch === ' ') {
      push('text', ch)
      i++
      continue
    }
    const atWordStart = i === 0 || line[i - 1] === ' '
    const op = atWordStart ? OPERATORS.find((o) => line.startsWith(o, i) && (i + o.length === line.length || line[i + o.length] === ' ')) : undefined
    if (op) {
      push('op', op)
      i += op.length
      expectCommand = op !== '>' && op !== '>>' && op !== ')'
      continue
    }
    if (ch === '{') {
      const end = line.indexOf('}', i)
      const stop = end === -1 ? line.length : end + 1
      push('ph', line.slice(i, stop))
      i = stop
      continue
    }
    if (ch === '"') {
      let j = i + 1
      while (j < line.length && line[j] !== '"') j += line[j] === '\\' ? 2 : 1
      const stop = Math.min(j + 1, line.length)
      push('str', line.slice(i, stop))
      i = stop
      continue
    }
    let j = i
    while (j < line.length && line[j] !== ' ' && line[j] !== '{' && line[j] !== '"') j++
    const word = line.slice(i, j)
    if (expectCommand && sign && word.startsWith(sign)) {
      push('prefix', sign)
      push('cmd', word.slice(sign.length))
    } else push(expectCommand ? 'cmd' : 'text', word)
    expectCommand = false
    i = j
  }
  return out
}
