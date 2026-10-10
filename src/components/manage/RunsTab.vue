<script setup lang="ts">
// The latest command and trigger runs in a channel: what ran, how it ended, and how long it took.
import { VxButton, VxCallout, VxChip, VxEmptyState, VxInput, VxSegmented, VxSkeleton, timeAgo } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import ChatLine from '@/components/ChatLine.vue'
import { admin, type Run } from '@/lib/admin'

const props = defineProps<{ login: string; sign: string }>()
const LIMITS = [50, 100, 200, 500].map((n) => ({ value: String(n), label: String(n) }))
const limit = ref('50')
const { data, error, loading, reload } = useResource(
  async () => (await admin.runs(props.login, Number(limit.value))).runs,
  { source: () => [props.login, limit.value], resetOnSource: false },
)

const query = ref('')
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value ?? []
  return q ? all.filter((r) => [r.expr, r.message, r.code, r.trigger_type, r.user_id].some((f) => f?.toLowerCase().includes(q))) : all
})
const outcome = (r: Run): { label: string; tone: 'ok' | 'bad' | 'warn' } =>
  r.cancelled_reason ? { label: r.cancelled_reason, tone: 'warn' } : r.code ? { label: r.code, tone: 'bad' } : { label: 'ok', tone: 'ok' }
</script>

<template>
  <section class="mtab">
    <div class="filters vx-form-row">
      <VxInput v-model="query" placeholder="Find in expressions and errors" aria-label="Find a run" class="grow" />
      <VxSegmented v-model="limit" :options="LIMITS" label="How many runs" />
      <VxButton :loading="loading" @click="reload">Refresh</VxButton>
    </div>
    <VxCallout v-if="error" tone="error" title="Couldn't load the runs">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" h="38px" /></div>
    <VxEmptyState v-else-if="!data.length" title="Nothing ran here yet" text="Commands and triggers show up here once they run." />
    <div v-else class="table-scroll vx-panel">
      <table class="vx-table">
        <thead><tr><th>When</th><th>From</th><th>Expression</th><th>Outcome</th><th>Took</th><th>User</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="`${r.at}-${i}`">
            <td class="vx-muted nowrap" :title="new Date(r.at).toLocaleString()">{{ timeAgo(r.at) }}</td>
            <td><VxChip :tone="r.trigger_type ? 'accent' : 'default'">{{ r.trigger_type ?? 'command' }}</VxChip></td>
            <td class="wrap"><ChatLine :lines="r.expr" :sign="sign" context="body" /></td>
            <td class="wrap">
              <VxChip :tone="outcome(r).tone">{{ outcome(r).label }}</VxChip>
              <div v-if="r.message" class="vx-muted small">{{ r.message }}</div>
            </td>
            <td class="vx-muted nowrap">{{ r.duration_ms === null ? '' : `${r.duration_ms} ms` }}</td>
            <td class="vx-muted vx-mono">{{ r.user_id ?? '' }}</td>
          </tr>
          <tr v-if="!rows.length"><td colspan="6" class="vx-muted">No run matches “{{ query }}”.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
