<script setup lang="ts">
// When the bot was listening, over the log's current range (the last 7 days if none), from
// /api/v2/channels/{login}/log/coverage: the holes it left and what backfill made of each. A hole can be shown in the
// log, or backfilled by whoever may run backfills; an admin follows the channel's backfills, or the one that filled a
// hole, to its jobs.
import type { LogGap } from '@vexoulz/platform-web/chat'
import { VxButton, VxChip } from '@vexoulz/ui'
import { computed } from 'vue'
import { can, isAdmin } from '@/lib/access'
import { admin } from '@/lib/admin'
import { channelSubject } from '@/lib/platform'
import { useAct } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{
  login: string
  channelId?: string
  /** The log's range, as its `datetime-local` inputs hold it; empty: the last 7 days, until now. */
  since: string
  until: string
}>()
const emit = defineEmits<{ show: [start: string, end: string] }>()

const WEEK = 7 * 24 * 3_600_000
const window = computed(() => ({
  since: new Date(props.since ? Date.parse(props.since) : Date.now() - WEEK).toISOString(),
  until: props.until ? new Date(props.until).toISOString() : undefined,
}))
const { data, error, reload } = useLoad(
  () => admin.coverage(props.login, window.value.since, window.value.until),
  () => [props.login, window.value],
)
const { busy, act } = useAct(reload)
const mayRun = computed(() => can('backfill.run', props.login))

const REASON: Record<LogGap['reason'], string> = {
  before_log: 'Before the log began',
  between_sessions: 'While the bot was away',
  not_listening: 'Since the bot stopped listening',
}
const day = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
function span(g: LogGap): string {
  const min = Math.round((Date.parse(g.end) - Date.parse(g.start)) / 60_000)
  return min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} days`
}
function filled(g: LogGap): { tone: 'ok' | 'warn' | 'bad' | 'default'; text: string } {
  const b = g.backfill
  if (!b) return { tone: 'default', text: 'not backfilled' }
  if (b.error) return { tone: 'bad', text: `backfill failed: ${b.error}` }
  const what = `${b.inserted ?? 0} new${b.provider ? ` from ${b.provider}` : ''}`
  return b.complete ? { tone: 'ok', text: `backfilled, ${what}` } : { tone: 'warn', text: `partly backfilled, ${what}` }
}
const backfill = (g: LogGap) =>
  act(
    `gap${g.start}`,
    () => admin.startBackfill(props.login, { from_ms: Date.parse(g.start), to_ms: Date.parse(g.end) }),
    'Queued a backfill of that gap',
  )
</script>

<template>
  <details class="coverage vx-panel">
    <summary>
      <span class="title">Coverage</span>
      <span class="vx-muted small">{{ since ? 'over the range searched' : 'the last 7 days' }}</span>
      <VxChip v-if="error" tone="bad">couldn't load</VxChip>
      <VxChip v-else-if="!data">…</VxChip>
      <VxChip v-else-if="data.complete" tone="ok">complete</VxChip>
      <VxChip v-else tone="warn">{{ data.gaps.length }} {{ data.gaps.length === 1 ? 'gap' : 'gaps' }}</VxChip>
      <RouterLink v-if="channelId && isAdmin()" class="small jobs" :to="{ path: '/manage/jobs', query: { subject: channelSubject(channelId) } }" @click.stop>
        backfill jobs
      </RouterLink>
    </summary>
    <p v-if="error" class="vx-muted small">{{ error }}</p>
    <template v-else-if="data">
      <p class="vx-muted small">
        Listening {{ data.sessions.length }} {{ data.sessions.length === 1 ? 'time' : 'times' }} between {{ day(data.since) }} and
        {{ day(data.until) }}.<template v-if="data.complete"> The log has every message Twitch let it see then.</template>
      </p>
      <ul v-if="data.gaps.length" class="gaps">
        <li v-for="g in data.gaps" :key="g.start">
          <div class="what">
            <strong>{{ REASON[g.reason] }}</strong>
            <span class="vx-muted small">{{ day(g.start) }} → {{ day(g.end) }} · {{ span(g) }}</span>
            <VxChip :tone="filled(g).tone">{{ filled(g).text }}</VxChip>
            <RouterLink v-if="g.backfill?.job_id && isAdmin()" class="small" :to="`/manage/jobs/${g.backfill.job_id}`">job #{{ g.backfill.job_id }}</RouterLink>
          </div>
          <span class="acts">
            <VxButton size="sm" variant="ghost" @click="emit('show', g.start, g.end)">Show in log</VxButton>
            <VxButton v-if="mayRun && !g.backfill?.complete" size="sm" :loading="busy.has(`gap${g.start}`)" @click="backfill(g)">Backfill</VxButton>
          </span>
        </li>
      </ul>
    </template>
  </details>
</template>

<style scoped>
.coverage { padding: 10px 14px; margin-bottom: 14px; }
summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; cursor: pointer; }
.title { font-weight: 600; }
.jobs { margin-left: auto; color: inherit; }
.gaps { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.gaps li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding-top: 8px; border-top: 1px solid var(--vx-line); }
.what { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.acts { display: flex; gap: 6px; }
</style>
