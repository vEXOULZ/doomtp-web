<script setup lang="ts">
// The searchable command table shared by the command reference and the channel pages. One line per command;
// clicking it opens the details underneath (arguments, cooldowns, examples, a custom command's body).
// On a phone the columns stack inside each row instead of being dropped.
import { VxChip, VxInput } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import { type CommandRow, filterRows } from '@/lib/commands'
import ChatLine from './ChatLine.vue'

const props = withDefaults(defineProps<{ rows: CommandRow[]; sign: string; noun?: string }>(), { noun: 'commands' })

const query = ref('')
const shown = computed(() => filterRows(props.rows, query.value))
const count = computed(() => {
  const n = shown.value.length
  return `${n} ${n === 1 ? props.noun.replace(/s$/, '') : props.noun}`
})
const open = ref(new Set<string>())
function toggle(key: string) {
  const next = new Set(open.value)
  if (!next.delete(key)) next.add(key)
  open.value = next
}
</script>

<template>
  <div class="cmdblock">
    <div class="filters">
      <VxInput
        v-model="query"
        type="search"
        clearable
        class="search"
        placeholder="Search by name, module, author or text…"
        @keydown.esc="query = ''"
      />
      <span class="vx-muted vx-mono count" aria-live="polite">{{ count }}</span>
    </div>

    <div class="table vx-panel" role="table" :aria-label="`${noun}, ${count}`">
      <div class="row head vx-eyebrow" role="row">
        <span role="columnheader">Command</span><span role="columnheader">Module</span>
        <span role="columnheader">Needs</span><span role="columnheader">What it does</span>
      </div>
      <div v-for="row in shown" :key="row.key" class="item" :class="{ 'is-open': open.has(row.key) }" role="rowgroup">
        <button
          type="button"
          class="row"
          role="row"
          :aria-expanded="open.has(row.key)"
          @click="toggle(row.key)"
        >
          <ChatLine class="name" role="cell" :lines="`${sign}${row.usage}`" :sign="sign" />
          <span class="vx-muted module" role="cell">{{ row.module }}</span>
          <span role="cell"><VxChip :tone="row.role === 'everyone' ? 'default' : 'accent'">{{ row.role }}</VxChip></span>
          <span class="summary" role="cell">{{ row.summary }}</span>
        </button>

        <div v-if="open.has(row.key)" class="detail">
          <p v-if="row.description">{{ row.description }}</p>
          <template v-if="row.kind !== 'built-in'">
            <p class="vx-muted">
              A custom command by <strong>@{{ row.owner }}</strong> (v{{ row.version }})<template v-if="row.kind === 'derived'">,
              published for every channel</template>. Its author can change it at any time.
            </p>
            <ChatLine :lines="row.body" :sign="sign" context="body" block />
          </template>
          <div class="chips">
            <VxChip k="needs">{{ row.role }}</VxChip>
            <VxChip v-if="row.aliases.length" k="also">{{ row.aliases.join(', ') }}</VxChip>
            <VxChip v-if="row.alwaysOn" tone="ok">always on</VxChip>
            <VxChip v-if="row.fixedPolicy">no cooldown, no role</VxChip>
            <VxChip v-for="c in row.cooldowns" :key="c.role" :k="c.role">{{ c.shared }}s shared / {{ c.personal }}s personal</VxChip>
          </div>
          <div v-if="row.params.length" class="params vx-scroll">
            <table class="vx-table">
              <thead><tr><th>Argument</th><th>Type</th><th>Required</th><th>Meaning</th></tr></thead>
              <tbody>
                <tr v-for="p in row.params" :key="p.position">
                  <td><code>{{ p.name }}</code> <span class="vx-muted">({{ p.position }})</span></td>
                  <td>{{ p.type }}<template v-if="p.choices?.length">: {{ p.choices.join(', ') }}</template></td>
                  <td>{{ p.required ? 'yes' : 'no' }}</td>
                  <td>{{ p.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <pre v-if="row.examples.length" class="vx-code"><template v-for="(e, i) in row.examples" :key="i"><template v-if="i">{{ '\n' }}</template><ChatLine :lines="e.invocation" :sign="sign" /><template v-if="e.output">{{ '\n  → ' }}{{ e.output }}</template></template></pre>
        </div>
      </div>
      <p v-if="!shown.length" class="vx-muted empty">Nothing matches that.</p>
    </div>
  </div>
</template>

<style scoped>
.filters { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.search { flex: 1; min-width: 0; }
.count { font-size: 12px; white-space: nowrap; }
.table { overflow: hidden; }
.row {
  display: grid;
  grid-template-columns: minmax(12rem, 32%) 7rem 8rem minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  border-bottom: 1px solid var(--vx-line);
  background: none;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
}
button.row { cursor: pointer; }
button.row:hover, .is-open > button.row { background: rgb(170 170 170 / 0.07); }
.row.head { font-size: 11px; }
/* Beats the pages' inline-code pill (.doc code): the name is the row, not a snippet in text. */
.name { font-family: var(--vx-font-mono); font-size: 13px; overflow-wrap: anywhere; padding: 0; background: none; border: 0; }
.module { font-size: 13px; }
.summary { color: var(--vx-ink); }
.detail { padding: 12px 14px 16px; border-bottom: 1px solid var(--vx-line); display: flex; flex-direction: column; gap: 10px; }
.detail p { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.params { overflow-x: auto; }
.params .vx-table { width: 100%; font-size: 13px; }
.item:last-of-type > .row, .item:last-of-type > .detail { border-bottom: 0; }
.empty { padding: 12px 14px; margin: 0; }

/* Phones: every column stays, stacked inside the row: the command and its role, then module and summary. */
@container vx-site (max-width: 700px) {
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; }
  .row.head { display: none; }
  .name { grid-column: 1; grid-row: 1; }
  .row > :nth-child(3) { grid-column: 2; grid-row: 1; }
  .module { grid-column: 1 / -1; grid-row: 2; font-size: 12px; }
  .summary { grid-column: 1 / -1; grid-row: 3; font-size: 13px; }
}
</style>
