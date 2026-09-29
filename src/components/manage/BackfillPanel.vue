<script setup lang="ts">
// History backfill jobs for a channel: the queue and the latest finished ones. The broadcaster queues a pass over
// every gap in the log (as `backfill` does in chat) and cancels a job that hasn't started.
import { VxButton, VxCallout, VxChip, VxEmptyState, timeAgo } from '@vexoulz/ui'
import { computed } from 'vue'
import { can } from '@/lib/access'
import { admin, type BackfillJob } from '@/lib/admin'
import { useAct } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string }>()
const { data, error, reload } = useLoad(() => admin.backfill(props.login), () => props.login)
const { busy, act } = useAct(reload)
const mayRun = computed(() => can('backfill.run', props.login))

const TONE: Record<string, 'ok' | 'bad' | 'accent' | 'default'> = { done: 'ok', failed: 'bad', running: 'accent' }
const day = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const result = (j: BackfillJob) =>
  j.error ?? (j.state === 'done' ? `${j.inserted} new of ${j.fetched} fetched${j.complete === false ? ', partial' : ''}` : '')
</script>

<template>
  <section class="backfill vx-panel">
    <div class="head">
      <h3 class="vx-eyebrow">Backfill jobs</h3>
      <VxButton
        v-if="mayRun"
        size="sm"
        variant="primary"
        :disabled="!data?.enabled"
        :loading="busy.has('gaps')"
        @click="act('gaps', () => admin.startBackfill(login, { gaps: true }), 'Queued a backfill of the gaps in the log')"
      >Backfill the gaps now</VxButton>
    </div>
    <p v-if="data && !data.enabled" class="vx-muted small">Turn Backfill on (above) to fill gaps in the log.</p>
    <p v-else-if="!mayRun" class="vx-muted small">Only the broadcaster starts a backfill.</p>
    <VxCallout v-if="error" tone="error" title="Couldn't load the backfill jobs">{{ error }}</VxCallout>
    <VxEmptyState v-else-if="data && !data.jobs.length" title="No backfill jobs yet" />
    <div v-else-if="data" class="table-scroll">
      <table class="vx-table">
        <thead><tr><th>Range</th><th>State</th><th>Asked</th><th>Result</th><th></th></tr></thead>
        <tbody>
          <tr v-for="j in data.jobs" :key="j.id">
            <td class="nowrap small">{{ day(j.from_ms) }} → {{ day(j.to_ms) }}</td>
            <td><VxChip :tone="TONE[j.state] ?? 'default'">{{ j.state }}</VxChip></td>
            <td class="vx-muted small nowrap" :title="new Date(j.requested_at).toLocaleString()">{{ timeAgo(j.requested_at) }} · {{ j.requested_by }}</td>
            <td class="small wrap" :class="{ bad: j.error }">{{ result(j) }}</td>
            <td class="end">
              <VxButton
                v-if="mayRun && j.state === 'queued'"
                size="sm"
                variant="ghost"
                :loading="busy.has(`c:${j.id}`)"
                @click="act(`c:${j.id}`, () => admin.cancelBackfill(login, j.id), 'Backfill job cancelled')"
              >Cancel</VxButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.backfill { display: grid; gap: 8px; padding: 14px 16px; margin-top: 14px; }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.head h3 { margin: 0; }
.small { font-size: 12px; margin: 0; }
.nowrap { white-space: nowrap; }
.bad { color: var(--vx-bad); }
</style>
