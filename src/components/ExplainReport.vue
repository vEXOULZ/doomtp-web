<script setup lang="ts">
// The full explain report (spec §9): how a line parsed, what each command resolved to, whether the caller may run
// it, and what it would do. Shared by the public report page and, later, the admin explain page.
import { VxCallout, VxChip } from '@vexoulz/ui'
import { computed } from 'vue'
import type { ExplainInvocation, ExplainReport } from '@/lib/api'
import { leadingSign } from '@/lib/lexer'
import ChatLine from './ChatLine.vue'

const props = defineProps<{ report: ExplainReport }>()
// A chat line is lexed as a line; any other context (a trigger, a body) has no sign.
const lineContext = computed(() => (props.report.context === 'line' ? 'line' : 'body'))

const wait = (inv: ExplainInvocation) => Math.max(inv.cooldown_tier_s, inv.cooldown_user_s)
const from = (inv: ExplainInvocation) => (inv.owner ? `${inv.source} by ${inv.owner} v${inv.version}` : inv.source)
</script>

<template>
  <div class="report">
    <div class="line">
      <ChatLine class="expr" :lines="report.expression" :sign="leadingSign(report.expression)" :context="lineContext" />
      <VxChip k="context">{{ report.context }}</VxChip>
      <VxChip v-if="report.channel">#{{ report.channel }}</VxChip>
    </div>

    <VxCallout v-if="report.parse_error" tone="error" title="Parse error">{{ report.parse_error }}</VxCallout>
    <template v-else>
      <h2 class="vx-display">Parsed as</h2>
      <pre class="vx-code">{{ report.ast }}</pre>

      <h2 class="vx-display">Commands</h2>
      <div class="table-scroll">
        <table class="vx-table">
          <thead>
            <tr><th>#</th><th>Command</th><th>From</th><th>Needs</th><th>Allowed</th><th>Cooldown</th><th>Input</th><th>Placeholders</th></tr>
          </thead>
          <tbody>
            <tr v-for="inv in report.invocations" :key="inv.index">
              <td class="vx-tabular">{{ inv.index }}</td>
              <td><code>{{ inv.name }}</code></td>
              <td>{{ from(inv) }}</td>
              <td>{{ inv.required_role || '—' }} <span class="vx-muted">(rank {{ inv.rank }} checked)</span></td>
              <td><VxChip :tone="inv.allowed ? 'ok' : 'bad'">{{ inv.allowed ? 'yes' : `no: ${inv.reason}` }}</VxChip></td>
              <td class="vx-tabular">{{ wait(inv) > 0 ? `${wait(inv).toFixed(0)}s left` : 'ready' }}</td>
              <td>{{ inv.input_mode }}</td>
              <td>
                <template v-for="(ph, i) in inv.placeholders" :key="ph.reference"><template v-if="i">, </template><code>{{ ph.reference }}</code><span v-if="!ph.available" class="bad"> not here<template v-if="ph.has_fallback">, falls back</template></span></template>
                <span v-if="!inv.placeholders.length" class="vx-muted">none</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template v-if="report.stores?.length">
        <h2 class="vx-display">Variable writes</h2>
        <div class="table-scroll">
          <table class="vx-table">
            <thead><tr><th>Variable</th><th>How</th><th>Allowed</th></tr></thead>
            <tbody>
              <tr v-for="s in report.stores" :key="s.variable">
                <td><code>{{ s.variable }}</code></td>
                <td>{{ s.append ? 'append' : 'set' }}</td>
                <td><VxChip :tone="s.allowed ? 'ok' : 'bad'">{{ s.allowed ? 'yes' : 'no: the write would go nowhere' }}</VxChip></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <h2 class="vx-display">Outcome</h2>
      <VxCallout v-if="report.failure" tone="error" :title="`Would fail${report.failed_index ? ` at command ${report.failed_index}` : ''}`">
        {{ report.failure.message }} (code {{ report.failure.code }})
      </VxCallout>
      <template v-else-if="report.ran && report.result">
        <p>
          Ran with variable writes discarded and nothing sent: code {{ report.result.code }}<template v-if="report.executed?.length">,
          commands {{ report.executed.join(', ') }} executed</template>.
        </p>
        <p>
          Would send:
          <code v-if="report.would_send">{{ report.would_send }}</code>
          <span v-else class="vx-muted">nothing</span>
        </p>
      </template>
      <VxCallout v-else tone="ok" title="Would run">Add <code>--run</code> to evaluate it too.</VxCallout>
    </template>
  </div>
</template>

<style scoped>
.line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.expr { font-size: 15px; }
.bad { color: var(--vx-bad); }
.report :deep(.vx-table) td { vertical-align: top; }
</style>
