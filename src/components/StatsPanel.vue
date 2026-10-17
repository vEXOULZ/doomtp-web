<script setup lang="ts">
// What the bot has been doing: chat lines it logged and sent over the last minute, hour and day, and the day's
// runs. With `build`, also what it is: its version, the tag or branch and commit it was built from, how long it
// has been up and how many channels it is in. The bot counts at most every 30 seconds, so this asks no faster.
import { VxChip } from '@vex/ui'
import { computed } from 'vue'
import type { BotStats, Counts } from '@/lib/api'
import { uptime } from '@/lib/format'

const props = defineProps<{ counts: Counts; build?: BotStats }>()

const n = (value: number) => value.toLocaleString()
const ROWS = computed(() => [
  { label: 'Chat lines logged', w: props.counts.messages_logged },
  { label: 'Messages the bot sent', w: props.counts.messages_sent },
])
const runs = computed(() => props.counts.runs_day)
const commitUrl = computed(() =>
  props.build?.commit ? `https://github.com/vexouLuna/doomtp-bot/commit/${props.build.commit}` : null,
)
</script>

<template>
  <div class="stats vx-panel">
    <div v-if="build" class="build">
      <VxChip tone="ok">online</VxChip>
      <span class="vx-mono">v{{ build.version }}</span>
      <span v-if="build.release && build.release !== `v${build.version}`" class="vx-muted vx-mono">{{ build.release }}</span>
      <a v-if="commitUrl" :href="commitUrl" class="vx-mono" target="_blank" rel="noopener">{{ build.commit!.slice(0, 7) }}</a>
      <span class="vx-muted">up {{ uptime(build.uptime_s) }}</span>
      <span class="vx-muted">· {{ build.channels }} {{ build.channels === 1 ? 'channel' : 'channels' }}</span>
    </div>
    <div class="grid" role="table" aria-label="Chat lines over the last minute, hour and day">
      <div role="row" class="row head">
        <span role="columnheader" class="vx-muted">Over the last</span>
        <span role="columnheader" class="num vx-muted">minute</span>
        <span role="columnheader" class="num vx-muted">hour</span>
        <span role="columnheader" class="num vx-muted">day</span>
      </div>
      <div v-for="r in ROWS" :key="r.label" role="row" class="row">
        <span role="rowheader">{{ r.label }}</span>
        <span role="cell" class="num vx-mono">{{ n(r.w.minute) }}</span>
        <span role="cell" class="num vx-mono">{{ n(r.w.hour) }}</span>
        <span role="cell" class="num vx-mono">{{ n(r.w.day) }}</span>
      </div>
    </div>
    <p class="runs small">
      <span class="vx-muted">Runs in the last day: </span>
      <span class="vx-mono">{{ n(runs.ok) }}</span> ran,
      <span class="vx-mono">{{ n(runs.failed) }}</span> failed,
      <span class="vx-mono">{{ n(runs.cancelled) }}</span> held back by moderation
    </p>
  </div>
</template>

<style scoped>
.stats { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.build { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: 13px; }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) repeat(3, auto); font-size: 13px; }
.row { display: contents; }
.row > span { padding: 7px 0; border-bottom: 1px solid var(--vx-line); }
.head > span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 0; }
.num { text-align: right; white-space: nowrap; }
.row > .num { padding-left: 18px; }
.runs { margin: 0; }
.small { font-size: 12px; }
</style>
