<script setup lang="ts">
import { VxButton, VxCallout, VxSkeleton } from '@vexoulz/ui'
import { computed, onMounted } from 'vue'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import ChatLine from '@/components/ChatLine.vue'
import Cmd from '@/components/Cmd.vue'
import DtpShell from '@/components/DtpShell.vue'
import { api } from '@/lib/api'
import { defaultSign, loadSite } from '@/lib/site'

const { data, error, reload } = useResource(async () => {
  const [language, grammar] = await Promise.all([api.language(), api.grammar(), loadSite()])
  return { language, grammar }
})
const p = computed(defaultSign)
const example = computed(() => `${p.value}random 1-6 | echo you rolled {_1}`)
const shape = computed(() => `${p.value}command argument "an argument with spaces" | other {_1} && third -> channel.saved`)

// The bot's own editor (a web component in /static/editor/editor.js, served by the bot on this origin). It upgrades
// the <textarea> it wraps once the script loads; until then, or without it, the textarea is an ordinary text box.
const EDITOR_SRC = '/static/editor/editor.js'
onMounted(() => {
  if (customElements.get('dtb-editor') || document.querySelector(`script[src="${EDITOR_SRC}"]`)) return
  const script = document.createElement('script')
  script.src = EDITOR_SRC
  script.defer = true
  document.head.appendChild(script)
})

const REFERENCES = [
  ['{_1}, {_2}', 'the result of an earlier command in the same line'],
  ['{_}', 'the previous result'],
  ['{_1[celsius]}', "a key of that result's data"],
  ['{arg.1}, {arg.2+}, {arg.name}', 'arguments, inside a custom command or trigger'],
  ['{$chatter.display}, {$channel.name}', "who and where: the bot's own fields start with $"],
  ['{channel.deaths}, {channel.stats[kills]}', 'variables; brackets go into a stored list or map'],
  ['{event.*}, {match.*}', 'trigger payload, listener captures'],
  ['{$now.*}, {$bot.*}, {run.*}', 'time, bot info, this run'],
  ['{channel.deaths * 2}, {!random 1-6}', 'an expression, and a command whose result becomes text'],
]
const EXIT_CODES = [
  ['0', 'success', 'the message, if there is one'],
  ['1', 'the command failed', 'yes, unless the channel turned error replies off'],
  ['2', 'bad arguments or a bad reference', 'yes: usage text'],
  ['3', 'nothing found', 'yes'],
  ['124 / 125', 'timed out / upstream rate limited', 'yes'],
  ['126', 'not allowed', 'no: silent, with an optional callback'],
  ['127', 'unknown or disabled command', "silent if it's the first word of the line"],
  ['128', 'on cooldown', 'no: silent, with an optional callback'],
  ['130', 'cancelled by moderation', 'no'],
]
const limits = computed(() => {
  const l = data.value?.language.limits ?? {}
  return [
    ['commands in one line', l.MAX_INVOCATIONS],
    ['custom commands inside each other', l.MAX_CC_DEPTH],
    ['characters in an expression', l.MAX_EXPR_CHARS],
    ['characters in a name', l.MAX_NAME_CHARS],
    ['placeholders inside each other', l.MAX_PLACEHOLDER_NESTING],
  ].filter(([, v]) => v !== undefined)
})
</script>

<template>
  <DtpShell>
    <article class="doc">
      <h1 class="vx-display">Language reference</h1>
      <p class="vx-muted">
        <template v-if="data">Version {{ data.language.syntax_version }}. </template>What a chat line can hold and how
        the bot reads it.
      </p>

      <h2 id="try" class="vx-display">Try one</h2>
      <p>
        Type an expression and the bot tells you what it makes of it: colours as you type, the exact error a chat user
        would get, and, once it parses, which command each name resolves to, what it would store and what it would
        say. Nothing runs, and nothing is sent to chat.
      </p>
      <div class="editor">
        <dtb-editor context="line" :prefix="p" explain :hint="example">
          <textarea name="expr" rows="3" spellcheck="false" :value="example"></textarea>
        </dtb-editor>
      </div>
      <p class="vx-muted small">
        Without JavaScript this is an ordinary text box.
      </p>

      <h2 class="vx-display">Shape of a line</h2>
      <ChatLine :lines="shape" :sign="p" block />
      <ul>
        <li>The command sign starts a line. After an emoji sign a space is allowed: <Cmd t=" ping" :sign="p" />.</li>
        <li>
          Arguments are split on spaces. Use <code>"quotes"</code> to keep spaces, and <code>\</code> to escape a
          character literally (<code>\"</code>, <code>\{</code>).
        </li>
        <li>Only the final result is sent to chat.</li>
      </ul>

      <VxCallout v-if="error" tone="error" title="Couldn't load the language details">
        {{ errorText(error) }}
        <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
      </VxCallout>
      <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" h="28px" /></div>

      <template v-if="data">
        <h2 class="vx-display">Operators</h2>
        <p>
          These count as operators only when they stand alone between spaces, so ordinary chat like
          <code>(lol)</code> or <code>a->b</code> is never mistaken for one.
        </p>
        <p class="list">
          <template v-for="(op, i) in data.language.operators.filter((o) => o !== ';')" :key="op"><template v-if="i"> · </template><code>{{ op }}</code></template>
        </p>
        <p><code>;</code> is reserved: it is rejected with a clear error rather than doing something surprising.</p>

        <h2 class="vx-display">Placeholders</h2>
        <p>
          <code>{reference}</code>, <code>{reference:type}</code>, <code>{reference ?? fallback}</code>, or an
          expression such as <code>{channel.deaths + 1 > 10}</code>. A reference
          that isn't available in the current context is an error before anything runs, and a missing value without a
          <code>??</code> fallback stops the command.
        </p>
        <h3>Roots</h3>
        <p class="list">
          <template v-for="(root, i) in data.language.roots" :key="root"><template v-if="i"> · </template><code>{{ root }}</code></template>
        </p>
        <div class="table-scroll">
          <table class="vx-table">
            <thead><tr><th>Reference</th><th>What it is</th></tr></thead>
            <tbody>
              <tr v-for="[ref, what] in REFERENCES" :key="ref">
                <td><template v-for="(r, i) in ref!.split(', ')" :key="r"><template v-if="i">, </template><code>{{ r }}</code></template></td>
                <td>{{ what }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 class="vx-display">Types</h2>
        <p>
          A placeholder can demand a type, and a bad value fails with usage text instead of running:
          <code>{arg.1:int}</code>, <code>{arg.1:choice(rock,paper,scissors)}</code>.
        </p>
        <p class="list">
          <template v-for="(type, i) in data.language.types" :key="type"><template v-if="i"> · </template><code>{{ type }}</code></template>
        </p>

        <h2 class="vx-display">Variables</h2>
        <p class="list">
          <template v-for="(ns, i) in data.language.variable_namespaces" :key="ns"><template v-if="i"> · </template><code>{{ ns }}.name</code></template>
        </p>
        <p>
          Write with <code>></code> (replace) or <code>>></code> (append), only when the command succeeded. Who may
          write what is on the <RouterLink to="/docs/features#variables">features page</RouterLink>.
        </p>
      </template>

      <h2 class="vx-display">Exit codes</h2>
      <div class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>Code</th><th>Meaning</th><th>Sent to chat?</th></tr></thead>
          <tbody>
            <tr v-for="[code, meaning, sent] in EXIT_CODES" :key="code"><td class="vx-tabular">{{ code }}</td><td>{{ meaning }}</td><td>{{ sent }}</td></tr>
          </tbody>
        </table>
      </div>

      <template v-if="data">
        <h2 class="vx-display">Limits</h2>
        <div class="table-scroll">
          <table class="vx-table">
            <thead><tr><th>Limit</th><th>Value</th></tr></thead>
            <tbody>
              <tr v-for="[name, value] in limits" :key="name"><td>{{ name }}</td><td class="vx-tabular">{{ value }}</td></tr>
              <tr><td>message length</td><td>2 messages of 500 characters</td></tr>
            </tbody>
          </table>
        </div>

        <template v-if="data.grammar.text">
          <h2 id="grammar" class="vx-display">Grammar</h2>
          <p class="vx-muted">
            One picture per rule. They're drawn to be read, so a few details are simplified; the editor above checks a
            line exactly.
          </p>
          <figure v-for="rule in data.grammar.rules" :key="rule.name" class="railroad">
            <figcaption class="vx-eyebrow">{{ rule.name }}</figcaption>
            <div class="rail vx-scroll">
              <img :src="`/static/grammar/${rule.name}.svg`" :alt="`Railroad diagram: ${rule.name} ::= ${rule.body}`" loading="lazy" />
            </div>
          </figure>
          <details class="text">
            <summary>The same thing as text</summary>
            <pre class="vx-code">{{ data.grammar.text }}</pre>
          </details>
        </template>
      </template>
    </article>
  </DtpShell>
</template>

<style scoped>
.small { font-size: 13px; }
.list { line-height: 2; }
.loading { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }

/* The bot's editor, themed through its --dtb-* properties (doomtp-bot web-editor/README.md, "Theming"). */
.editor {
  --dtb-bg: var(--vx-surface);
  --dtb-raised: var(--vx-surface-2);
  --dtb-ink: var(--vx-ink);
  --dtb-muted: var(--vx-muted);
  --dtb-line: var(--vx-line);
  --dtb-accent: var(--vx-accent);
  --dtb-accent-ink: var(--vx-bg);
  --dtb-ok: var(--vx-ok);
  --dtb-bad: var(--vx-bad);
  --dtb-font: var(--vx-font-mono);
  --dtb-font-size: 14px;
  --dtb-small-font-size: 13px;
  --dtb-radius: var(--vx-radius-sm);
  --dtb-gap: 8px;
  --dtb-control-height: var(--vx-ctl);
  margin: 0 0 8px;
}
/* The textarea it upgrades, as it looks before the script loads (or without it). */
.editor textarea {
  width: 100%;
  padding: 10px 12px;
  font-family: var(--vx-font-mono);
  font-size: 14px;
  color: var(--vx-ink);
  background: var(--vx-surface);
  border: 1px solid var(--vx-line);
  border-radius: var(--vx-radius-sm);
  resize: vertical;
}

.railroad { margin: 0 0 16px; }
.railroad figcaption { margin-bottom: 4px; }
/* The diagrams carry their own dark styling; they scroll sideways when wider than the page. */
.rail { overflow-x: auto; padding: 8px; background: var(--vx-surface-2); border: 1px solid var(--vx-line); border-radius: var(--vx-radius-sm); }
.rail img { display: block; max-width: none; }
.text summary { cursor: pointer; margin-bottom: 8px; color: var(--vx-muted); }
</style>
