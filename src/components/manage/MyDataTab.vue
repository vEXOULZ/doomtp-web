<script setup lang="ts">
// What the bot keeps about you: your variables (`chatter.*` everywhere, `channel.chatter.*` per channel, and your
// commands' `publisher.*`), or your runs in every channel, newest first.
import { VxButton, VxCallout, VxChip, VxEmptyState, VxInput, VxSegmented, VxSkeleton, timeAgo } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import { admin, type MyRun, type MyVariable } from '@/lib/admin'
import { shown } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ show: 'variables' | 'runs' }>()

const query = ref('')
const limit = ref('50')
const LIMITS = ['50', '200', '500'].map((v) => ({ value: v, label: v }))
const { data, error, loading, reload } = useLoad(
  async () => (props.show === 'variables' ? { variables: (await admin.myVariables()).variables } : { runs: (await admin.myRuns(Number(limit.value))).runs }),
  () => `${props.show}:${limit.value}`,
)

const fullName = (v: MyVariable) => `${v.namespace}.${v.name}`
const variables = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value?.variables ?? []
  return q ? all.filter((v) => `${fullName(v)} ${v.channel ?? ''} ${shown(v.value)}`.toLowerCase().includes(q)) : all
})
const runs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value?.runs ?? []
  return q ? all.filter((r) => `${r.expr} ${r.channel ?? ''} ${r.message ?? ''} ${r.code ?? ''}`.toLowerCase().includes(q)) : all
})
const outcome = (r: MyRun): { label: string; tone: 'ok' | 'bad' | 'warn' } =>
  r.cancelled_reason ? { label: r.cancelled_reason, tone: 'warn' } : r.code ? { label: r.code, tone: 'bad' } : { label: 'ok', tone: 'ok' }
</script>

<template>
  <section class="mtab">
    <div class="filters vx-form-row">
      <VxInput v-model="query" :placeholder="show === 'variables' ? 'Find a variable or value' : 'Find in expressions and errors'" aria-label="Find" class="grow" />
      <VxSegmented v-if="show === 'runs'" v-model="limit" :options="LIMITS" label="How many runs" />
      <VxButton :loading="loading" @click="reload">Refresh</VxButton>
    </div>
    <VxCallout v-if="error" tone="error" :title="`Couldn't load your ${show}`">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 5" :key="i" h="38px" /></div>

    <template v-else-if="show === 'variables'">
      <p class="vx-muted intro">
        Yours everywhere (<code>chatter.*</code>), yours in one channel (<code>channel.chatter.*</code>), and what your
        commands keep (<code>publisher.*</code>). Commands write them as they run.
      </p>
      <VxEmptyState v-if="!data.variables?.length" title="No variables yet" text="They appear once a command saves something for you." />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Name</th><th>Where</th><th>Value</th><th>Changed</th></tr></thead>
          <tbody>
            <tr v-for="(v, i) in variables" :key="`${fullName(v)}:${v.channel}:${i}`">
              <td class="vx-mono nowrap">{{ fullName(v) }}</td>
              <td class="vx-muted">{{ v.channel ? `#${v.channel}` : 'everywhere' }}</td>
              <td class="vx-mono wrap value">{{ shown(v.value) }}</td>
              <td class="vx-muted nowrap" :title="v.updated_at ? new Date(v.updated_at).toLocaleString() : undefined">{{ timeAgo(v.updated_at) }}</td>
            </tr>
            <tr v-if="!variables.length"><td colspan="4" class="vx-muted">Nothing matches “{{ query }}”.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <VxEmptyState v-if="!data.runs?.length" title="Nothing ran for you yet" text="Commands you run in chat show up here, in every channel." />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>When</th><th>Channel</th><th>Expression</th><th>Outcome</th><th>Took</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in runs" :key="`${r.at}-${i}`">
              <td class="vx-muted nowrap" :title="new Date(r.at).toLocaleString()">{{ timeAgo(r.at) }}</td>
              <td class="vx-mono">#{{ r.channel ?? r.channel_id }}</td>
              <td class="wrap"><ChatLine :lines="r.expr" sign="!" context="body" /></td>
              <td class="wrap">
                <VxChip :tone="outcome(r).tone">{{ outcome(r).label }}</VxChip>
                <div v-if="r.message" class="vx-muted small">{{ r.message }}</div>
              </td>
              <td class="vx-muted nowrap">{{ r.duration_ms === null ? '' : `${r.duration_ms} ms` }}</td>
            </tr>
            <tr v-if="!runs.length"><td colspan="5" class="vx-muted">No run matches “{{ query }}”.</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.value { max-width: 28rem; font-size: 12.5px; }
</style>
