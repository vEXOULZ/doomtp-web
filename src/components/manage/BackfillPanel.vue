<script setup lang="ts">
// History backfill jobs for a channel: the queue and the latest finished ones. The broadcaster queues a pass over
// every gap in the log (as `backfill` does in chat), or any range they pick (from before the bot was listening,
// say), and cancels a job that hasn't started. Each is a `chat_backfill` job run: an admin follows it to its job page.
import { VxButton, VxCallout, VxChip, VxEmptyState, VxField, timeAgo } from '@vexoulz/ui'
import { computed, reactive, ref, watch } from 'vue'
import { can, isAdmin } from '@/lib/access'
import { admin, type BackfillJob } from '@/lib/admin'
import { useAct } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string }>()
const { data, error, reload } = useLoad(() => admin.backfill(props.login), () => props.login)
const { busy, act } = useAct(reload)
const mayRun = computed(() => can('backfill.run', props.login))

const TONE: Record<string, 'ok' | 'bad' | 'accent' | 'default'> = { done: 'ok', failed: 'bad', running: 'accent' }
const day = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// ── a range of their choosing, in the viewer's own time ──
const HOUR = 3_600_000
const pad = (n: number) => String(n).padStart(2, '0')
/** Epoch ms → the `datetime-local` input's value. */
function local(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const parse = (v: string) => (v ? new Date(v).getTime() : null)
const range = reactive({ from: '', to: '' })
const fromMs = computed(() => parse(range.from))
const toMs = computed(() => parse(range.to))
const rangeError = computed(() => {
  const now = Date.now()
  if (fromMs.value === null) return null
  if (fromMs.value >= now) return 'The start is in the future.'
  if (toMs.value !== null && toMs.value <= fromMs.value) return 'The end must come after the start.'
  return null
})
// When the log begins: the day before it is the usual "before the bot was up" range.
const logStart = ref<number | null>(null)
watch(
  () => [props.login, mayRun.value && data.value?.enabled] as const,
  async ([login, load]) => {
    logStart.value = null
    if (!load) return
    try {
      const got = await admin.coverage(login, new Date(0).toISOString())
      const start = got.gaps.find((g) => g.reason === 'before_log')?.end
      logStart.value = start ? Date.parse(start) : null
    } catch {
      // no coverage (an older bot, or no log): the preset just isn't offered
    }
  },
  { immediate: true },
)
const PRESETS = [
  { label: 'Last hour', hours: 1 },
  { label: 'Last 6 hours', hours: 6 },
  { label: 'Last 24 hours', hours: 24 },
]
function preset(hours: number) {
  Object.assign(range, { from: local(Date.now() - hours * HOUR), to: '' })
}
function beforeLog() {
  if (logStart.value === null) return
  Object.assign(range, { from: local(logStart.value - 24 * HOUR), to: local(logStart.value) })
}
async function queueRange() {
  if (fromMs.value === null || rangeError.value) return
  const body = { from_ms: fromMs.value, ...(toMs.value === null ? {} : { to_ms: toMs.value }) }
  if (await act('range', () => admin.startBackfill(props.login, body), 'Queued a backfill of that range')) {
    Object.assign(range, { from: '', to: '' })
  }
}

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
    <form v-if="mayRun && data?.enabled" class="range" @submit.prevent="queueRange">
      <p class="vx-muted small">
        Or fetch a range of your choosing, in your own time: chat from before the bot joined, say. The history
        service keeps only recent chat, and only for channels it was already following, so an older range can come
        back partial.
      </p>
      <div class="vx-form-row">
        <VxField label="From" :error="rangeError ?? undefined">
          <template #default="{ id }">
            <input :id="id" v-model="range.from" class="vx-input" type="datetime-local" :max="local(Date.now())" required />
          </template>
        </VxField>
        <VxField label="To" help="Empty: until now.">
          <template #default="{ id }">
            <input :id="id" v-model="range.to" class="vx-input" type="datetime-local" :min="range.from || undefined" :max="local(Date.now())" />
          </template>
        </VxField>
        <VxButton type="submit" :disabled="fromMs === null || !!rangeError" :loading="busy.has('range')">Backfill this range</VxButton>
      </div>
      <div class="presets">
        <button v-for="p in PRESETS" :key="p.label" type="button" class="vx-chip" @click="preset(p.hours)">{{ p.label }}</button>
        <button
          v-if="logStart !== null"
          type="button"
          class="vx-chip"
          :title="`The log begins ${day(logStart)}`"
          @click="beforeLog"
        >The day before the log began</button>
      </div>
    </form>
    <VxCallout v-if="error" tone="error" title="Couldn't load the backfill jobs">{{ error }}</VxCallout>
    <VxEmptyState v-else-if="data && !data.jobs.length" title="No backfill jobs yet" />
    <div v-else-if="data" class="table-scroll">
      <table class="vx-table">
        <thead><tr><th>Range</th><th>State</th><th>Asked</th><th>Result</th><th></th></tr></thead>
        <tbody>
          <tr v-for="j in data.jobs" :key="j.id">
            <td class="nowrap small">{{ day(j.from_ms) }} → {{ day(j.to_ms) }}</td>
            <td class="nowrap">
              <VxChip :tone="TONE[j.state] ?? 'default'">{{ j.state }}</VxChip>
              <RouterLink v-if="isAdmin()" class="job small" :to="`/manage/jobs/${j.id}`">job {{ j.id }}</RouterLink>
            </td>
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
.range { display: grid; gap: 10px; padding: 4px 0 8px; }
.presets { display: flex; flex-wrap: wrap; gap: 6px; }
.presets .vx-chip { cursor: pointer; }
.small { font-size: 12px; margin: 0; }
.nowrap { white-space: nowrap; }
.bad { color: var(--vx-bad); }
.job { margin-left: 6px; color: inherit; }
</style>
