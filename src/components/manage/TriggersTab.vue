<script setup lang="ts">
// A channel's triggers and timers: listeners on chat, Twitch events, timers and crons. Added, turned on or off and
// deleted as `trigger` and `timer` do in chat; a new one runs at its creator's rank at most.
import { VxButton, VxCheckbox, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxRadioGroup, VxSelect, VxStepper, VxSwitch } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import { can, rankIn } from '@/lib/access'
import { admin, TRIGGER_EVENTS, type Trigger, type TriggerBody } from '@/lib/admin'
import { LOG_LEVELS } from '@/lib/modules'
import { onOff, useAct } from '@/lib/useAct'

const props = defineProps<{ login: string; sign: string; triggers: Trigger[]; capabilities: string[]; reload: () => Promise<void> }>()
const { busy, act } = useAct(props.reload)

function matches(t: Trigger) {
  if (typeof t.match.regex === 'string') return t.match.regex
  if (typeof t.schedule.cron === 'string') return t.schedule.cron
  if (typeof t.schedule.every_s === 'number') return `every ${every(t.schedule.every_s)}`
  const rest = { ...t.match, ...t.schedule }
  return Object.keys(rest).length ? JSON.stringify(rest) : ''
}
const every = (s: number) => (s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`)
const conditions = (t: Trigger) =>
  [t.schedule.only_live && 'only live', t.schedule.min_chat_lines && `${t.schedule.min_chat_lines}+ lines`, t.schedule.jitter_s && `±${t.schedule.jitter_s}s`]
    .filter(Boolean)
    .join(' · ')
const deleting = ref<number | null>(null)

// ── the new-trigger form: its fields follow the kind picked ──
const KINDS = [
  { value: 'listener', label: 'Listener', hint: 'runs on chat messages that match a pattern' },
  { value: 'event', label: 'Twitch event', hint: 'a raid, sub, cheer, follow, redemption, or the stream going live' },
  { value: 'timer', label: 'Timer', hint: 'every so often' },
  { value: 'cron', label: 'Cron', hint: 'at set times, in the channel’s time zone' },
] as const
type Kind = (typeof KINDS)[number]['value']
// Events that need something the channel granted the bot (ADR-0007).
const NEEDS: Record<string, string> = { follow: 'followers', redemption: 'redemptions', cheer: 'bits' }
const maxRank = computed(() => rankIn(props.login))
const blank = () => ({
  kind: 'listener' as Kind,
  expr: '',
  regex: '',
  name: '',
  event: 'raid',
  every: 15,
  unit: 'm',
  cron: '',
  onlyLive: false,
  minLines: 0,
  runAs: Math.min(maxRank.value, 1000),
  log: 'output',
})
const form = reactive(blank())
const creating = ref(false)
function openCreate() {
  Object.assign(form, blank())
  creating.value = true
}
const kindOptions = KINDS.map((k) => ({ value: k.value, label: `${k.label}: ${k.hint}` }))
const eventOptions = computed(() =>
  TRIGGER_EVENTS.map((e) => {
    const need = NEEDS[e]
    const missing = need && props.capabilities.length && !props.capabilities.includes(need)
    return { value: e, label: missing ? `${e} (the channel hasn't granted ${need})` : e }
  }),
)
const UNITS = [{ value: 's', label: 'seconds' }, { value: 'm', label: 'minutes' }, { value: 'h', label: 'hours' }]
const LOGS = LOG_LEVELS.map((l) => ({ value: l, label: l }))

const body = computed<TriggerBody | null>(() => {
  const expr = form.expr.trim()
  if (!expr) return null
  const base = { expr, run_as_rank: form.runAs, log_level: form.log }
  const timing = { ...(form.onlyLive ? { only_live: true } : {}), ...(form.minLines ? { min_chat_lines: form.minLines } : {}) }
  switch (form.kind) {
    case 'listener':
      if (!form.regex.trim()) return null
      return { ...base, type: 'listener', match: { regex: form.regex.trim(), ...(form.name.trim() ? { name: form.name.trim() } : {}) } }
    case 'event':
      return { ...base, type: form.event }
    case 'timer':
      return { ...base, type: 'timer', schedule: { every_s: form.every * { s: 1, m: 60, h: 3600 }[form.unit as 's' | 'm' | 'h'], ...timing } }
    case 'cron':
      if (!form.cron.trim()) return null
      return { ...base, type: 'cron', schedule: { cron: form.cron.trim(), ...timing } }
  }
  return null
})
async function create() {
  if (!body.value) return
  const made = body.value.type
  if (await act('t-add', () => admin.createTrigger(props.login, body.value!), `Added a ${made}`)) creating.value = false
}
</script>

<template>
  <section class="mtab">
    <div v-if="can('triggers.edit', login)" class="filters">
      <VxButton variant="primary" @click="openCreate">New trigger or timer</VxButton>
    </div>
    <VxEmptyState v-if="!triggers.length" title="No triggers or timers">
      <template #default>
        Add one here, or in chat with <ChatLine :lines="`${sign}trigger listen <regex> => <expression>`" :sign="sign" /> or
        <ChatLine :lines="`${sign}timer add 15m <expression>`" :sign="sign" />.
      </template>
    </VxEmptyState>
    <div v-else class="table-scroll vx-panel">
      <table class="vx-table">
        <thead><tr><th>Type</th><th>Matches</th><th>Expression</th><th>Runs as</th><th>Log</th><th>On</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in triggers" :key="t.id">
            <td><VxChip :tone="t.type === 'timer' || t.type === 'cron' ? 'default' : 'accent'">{{ t.type }}</VxChip></td>
            <td class="vx-mono vx-muted wrap">
              {{ matches(t) }}
              <div v-if="t.match.name" class="small">named {{ t.match.name }}</div>
              <div v-if="conditions(t)" class="small">{{ conditions(t) }}</div>
            </td>
            <td class="wrap"><ChatLine :lines="t.expr" :sign="sign" context="body" /></td>
            <td class="vx-muted nowrap">rank {{ t.run_as_rank }}</td>
            <td class="vx-muted">{{ t.log_level ?? '' }}</td>
            <td>
              <VxSwitch
                :model-value="t.enabled"
                :disabled="!can('triggers.edit', login) || busy.has(`t:${t.id}`)"
                @update:model-value="(on: boolean) => act(`t:${t.id}`, () => admin.setTrigger(login, t.id, on), `${t.type} turned ${onOff(on)}`)"
              ><span class="sr-only">{{ t.type }} {{ t.id }}</span></VxSwitch>
            </td>
            <td class="end"><VxButton v-if="can('triggers.edit', login)" size="sm" variant="ghost" @click="deleting = t.id">Delete</VxButton></td>
          </tr>
        </tbody>
      </table>
    </div>

    <VxDialog v-model:open="creating" title="New trigger or timer" width="560px">
      <form id="trigger-form" class="dialog-form" @submit.prevent="create">
        <VxRadioGroup v-model="form.kind" :options="kindOptions" label="Kind" />
        <template v-if="form.kind === 'listener'">
          <VxField label="Pattern" help="A regular expression, matched against each chat message.">
            <template #default="{ id }"><VxInput :id="id" v-model="form.regex" mono placeholder="^hello\b" /></template>
          </VxField>
          <VxField label="Name" help="Optional: lets chat turn it on and off by name.">
            <template #default="{ id }"><VxInput :id="id" v-model="form.name" mono /></template>
          </VxField>
        </template>
        <VxField v-else-if="form.kind === 'event'" label="Event">
          <template #default="{ id }"><VxSelect :id="id" v-model="form.event" :options="eventOptions" width="100%" /></template>
        </VxField>
        <template v-else>
          <VxField v-if="form.kind === 'timer'" label="Every" help="Between a minute and a day.">
            <template #default="{ id }">
              <span class="every">
                <VxStepper :id="id" v-model="form.every" :min="1" :max="form.unit === 'h' ? 24 : form.unit === 'm' ? 1440 : 86400" />
                <VxSelect v-model="form.unit" :options="UNITS" width="140px" />
              </span>
            </template>
          </VxField>
          <VxField v-else label="When" help="Five fields: minute hour day month weekday. 0 18 * * fri is 18:00 on Fridays.">
            <template #default="{ id }"><VxInput :id="id" v-model="form.cron" mono placeholder="0 18 * * fri" /></template>
          </VxField>
          <VxCheckbox v-model="form.onlyLive" label="Only while the stream is live" />
          <VxField label="Chat lines needed since it last ran" help="0 fires whatever chat does.">
            <template #default="{ id }"><VxStepper :id="id" v-model="form.minLines" :min="0" :max="1000" /></template>
          </VxField>
        </template>
        <VxField label="Expression" help="What it runs, as a custom command's body.">
          <template #default="{ id }"><VxInput :id="id" v-model="form.expr" mono placeholder="echo hi {$chatter.display}" /></template>
        </VxField>
        <VxField label="Runs as rank" :help="`What it may do: at most your own rank here (${maxRank}).`">
          <template #default="{ id }"><VxStepper :id="id" v-model="form.runAs" :min="0" :max="maxRank" :step="10" /></template>
        </VxField>
        <VxField label="Log level">
          <template #default="{ id }"><VxSelect :id="id" v-model="form.log" :options="LOGS" width="180px" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="trigger-form" variant="primary" :loading="busy.has('t-add')" :disabled="!body">Add</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="deleting !== null" title="Delete this trigger?" @update:open="(v: boolean) => { if (!v) deleting = null }">
      It stops firing at once. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('t-del')"
          @click="act('t-del', () => admin.deleteTrigger(login, deleting!), 'Trigger deleted').then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.every { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
</style>
