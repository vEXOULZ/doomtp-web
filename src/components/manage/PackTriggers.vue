<script setup lang="ts">
// One of your packs' own triggers (ADR-0032), as `cc pack trigger` manages them in chat. They fire in every channel
// where the pack is published and its module is on, at everyone's rank, and may call only the pack's public commands
// and the built-ins. A pack's clock fires at most every 15 minutes, and a pack has at most 10 triggers.
import { VxButton, VxCheckbox, VxChip, VxDialog, VxField, VxInput, VxRadioGroup, VxSelect, VxStepper, VxSwitch } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import { admin, NO_CHATTER, PACK_MIN_EVERY_S, TRIGGER_EVENTS, type MyPack, type PackTrigger, type PackTriggerBody } from '@/lib/admin'
import { conditions, cooldowns, matches, NEEDS } from '@/lib/triggers'
import { onOff, useAct } from '@/lib/useAct'

const props = defineProps<{ pack: MyPack; reload: () => Promise<unknown> }>()
const { busy, act } = useAct(props.reload)
const triggers = computed(() => props.pack.triggers ?? [])
const MAX = 10

const KINDS = [
  { value: 'listener', label: 'Listener: runs on chat messages that match a pattern' },
  { value: 'event', label: 'Twitch event: a raid, sub, cheer, follow, redemption, pyramid, or the stream going live' },
  { value: 'timer', label: 'Timer: every so often, 15 minutes at least' },
  { value: 'cron', label: 'Cron: at set times, in each channel’s time zone' },
]
type Kind = 'listener' | 'event' | 'timer' | 'cron'
const UNITS = [{ value: 'm', label: 'minutes' }, { value: 'h', label: 'hours' }]
const eventOptions = TRIGGER_EVENTS.map((e) => ({ value: e, label: NEEDS[e] ? `${e} (where the channel granted ${NEEDS[e]})` : e }))
const KEY = /^[a-z][a-z0-9_]{0,31}$/

const blank = () => ({
  kind: 'listener' as Kind,
  key: '',
  expr: '',
  regex: '',
  event: 'raid',
  every: 30,
  unit: 'm',
  cron: '',
  onlyLive: false,
  minLines: 0,
  cooldown: 0,
  userCooldown: 0,
})
const form = reactive(blank())
const open = ref(false)
/** The trigger being edited; null while adding one. */
const editing = ref<PackTrigger | null>(null)
function openAdd() {
  Object.assign(form, blank())
  editing.value = null
  open.value = true
}
function openEdit(t: PackTrigger) {
  const every = typeof t.schedule.every_s === 'number' ? t.schedule.every_s : 1800
  const unit = every % 3600 === 0 ? 'h' : 'm'
  Object.assign(form, blank(), {
    kind: t.type === 'listener' || t.type === 'timer' || t.type === 'cron' ? t.type : 'event',
    key: t.key,
    expr: t.expr,
    regex: typeof t.match.regex === 'string' ? t.match.regex : '',
    event: t.type,
    every: every / (unit === 'h' ? 3600 : 60),
    unit,
    cron: typeof t.schedule.cron === 'string' ? t.schedule.cron : '',
    onlyLive: !!t.schedule.only_live,
    minLines: typeof t.schedule.min_chat_lines === 'number' ? t.schedule.min_chat_lines : 0,
    cooldown: t.cooldown_s,
    userCooldown: t.user_cooldown_s,
  })
  editing.value = t
  open.value = true
}

const key = computed(() => form.key.trim().toLowerCase())
const everyS = computed(() => form.every * (form.unit === 'h' ? 3600 : 60))
/** Whether the kind picked has a chatter to hold to a cooldown of their own. */
const hasChatter = computed(() => !NO_CHATTER.includes(form.kind === 'event' ? form.event : form.kind))
const body = computed<PackTriggerBody | null>(() => {
  const expr = form.expr.trim()
  if (!expr || !KEY.test(key.value)) return null
  const base = { expr, cooldown_s: form.cooldown, user_cooldown_s: hasChatter.value ? form.userCooldown : 0 }
  const timing = { ...(form.onlyLive ? { only_live: true } : {}), ...(form.minLines ? { min_chat_lines: form.minLines } : {}) }
  // The jitter isn't on the form, so an edit keeps it.
  const jitter = editing.value?.schedule.jitter_s ? { jitter_s: editing.value.schedule.jitter_s } : {}
  switch (form.kind) {
    case 'listener':
      return form.regex.trim() ? { ...base, type: 'listener', match: { regex: form.regex.trim() } } : null
    case 'event':
      return { ...base, type: form.event }
    case 'timer':
      return everyS.value >= PACK_MIN_EVERY_S ? { ...base, type: 'timer', schedule: { every_s: everyS.value, ...timing, ...jitter } } : null
    case 'cron':
      return form.cron.trim() ? { ...base, type: 'cron', schedule: { cron: form.cron.trim(), ...timing } } : null
  }
  return null
})
async function save() {
  if (!body.value) return
  const verb = editing.value ? 'saved' : 'added'
  if (await act('pt-save', () => admin.setPackTrigger(props.pack.name, key.value, body.value!), `${props.pack.name} trigger ${key.value} ${verb}`)) {
    open.value = false
  }
}
const deleting = ref<string | null>(null)
const where = computed(() => (props.pack.published.length ? 'wherever the pack is published' : 'once the pack is published'))
</script>

<template>
  <div class="pack-triggers">
    <div class="head">
      <h3 class="vx-eyebrow">Triggers</h3>
      <VxButton size="sm" :disabled="triggers.length >= MAX" @click="openAdd">Add a trigger</VxButton>
    </div>
    <p v-if="!triggers.length" class="vx-muted small">
      None yet. A trigger runs on its own {{ where }}, on a chat line, a Twitch event or a clock.
    </p>
    <div v-else class="table-scroll">
      <table class="vx-table">
        <tbody>
          <tr v-for="t in triggers" :key="t.key">
            <td class="vx-mono nowrap">{{ t.key }}</td>
            <td><VxChip :tone="t.type === 'timer' || t.type === 'cron' ? 'default' : 'accent'">{{ t.type }}</VxChip></td>
            <td class="vx-mono vx-muted wrap">
              {{ matches(t) }}
              <div v-if="conditions(t)" class="small">{{ conditions(t) }}</div>
              <div v-if="cooldowns(t)" class="small">{{ cooldowns(t) }}</div>
            </td>
            <td class="wrap"><ChatLine :lines="t.expr" sign="!" context="body" /></td>
            <td>
              <VxSwitch
                :model-value="t.enabled"
                :disabled="busy.has(`pt:${t.key}`)"
                @update:model-value="(on: boolean) => act(`pt:${t.key}`, () => admin.editPackTrigger(pack.name, t.key, { enabled: on }), `${pack.name} trigger ${t.key} turned ${onOff(on)}`)"
              ><span class="sr-only">{{ t.key }}</span></VxSwitch>
            </td>
            <td class="end nowrap">
              <VxButton size="sm" variant="ghost" @click="openEdit(t)">Edit</VxButton>
              <VxButton size="sm" variant="ghost" @click="deleting = t.key">Delete</VxButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <VxDialog v-model:open="open" :title="editing ? `Edit ${pack.name} trigger ${editing.key}` : `New trigger in ${pack.name}`" width="560px">
      <p class="vx-muted small intro">
        It runs {{ where }}, at everyone's rank. It can call this pack's public commands and the built-ins. A channel
        turns it off with the {{ pack.name }} module.
      </p>
      <form id="pack-trigger-form" class="dialog-form" @submit.prevent="save">
        <VxField v-if="!editing" label="Key" help="Its name in the pack: a letter, then letters, digits or _.">
          <template #default="{ id }"><VxInput :id="id" v-model="form.key" mono placeholder="welcome" :invalid="!!form.key && !KEY.test(key)" /></template>
        </VxField>
        <VxRadioGroup v-model="form.kind" :options="KINDS" label="Kind" />
        <VxField v-if="form.kind === 'listener'" label="Pattern" help="A regular expression, matched against each chat message.">
          <template #default="{ id }"><VxInput :id="id" v-model="form.regex" mono placeholder="^hello\b" /></template>
        </VxField>
        <VxField v-else-if="form.kind === 'event'" label="Event">
          <template #default="{ id }"><VxSelect :id="id" v-model="form.event" :options="eventOptions" width="100%" /></template>
        </VxField>
        <template v-else>
          <VxField v-if="form.kind === 'timer'" label="Every" help="Between 15 minutes and a day.">
            <template #default="{ id }">
              <span class="every">
                <VxStepper :id="id" v-model="form.every" :min="form.unit === 'h' ? 1 : 15" :max="form.unit === 'h' ? 24 : 1440" />
                <VxSelect v-model="form.unit" :options="UNITS" width="140px" />
              </span>
            </template>
          </VxField>
          <VxField v-else label="When" help="minute hour day month weekday, at most every 15 minutes. 0 18 * * fri is 18:00 on Fridays.">
            <template #default="{ id }"><VxInput :id="id" v-model="form.cron" mono placeholder="0 18 * * fri" /></template>
          </VxField>
          <VxCheckbox v-model="form.onlyLive" label="Only while the stream is live" />
          <VxField label="Chat lines needed since it last ran" help="0 fires whatever chat does.">
            <template #default="{ id }"><VxStepper :id="id" v-model="form.minLines" :min="0" :max="1000" /></template>
          </VxField>
        </template>
        <VxField label="Expression" help="What it runs: this pack's public commands and the built-ins.">
          <template #default="{ id }"><VxInput :id="id" v-model="form.expr" mono placeholder="echo hi {$chatter.display}" /></template>
        </VxField>
        <div class="cooldowns">
          <VxField label="Cooldown" help="Seconds before it fires again in a channel. 0 is none.">
            <template #default="{ id }"><VxStepper :id="id" v-model="form.cooldown" :min="0" :max="86400" :step="5" /></template>
          </VxField>
          <VxField
            label="Per chatter"
            :help="hasChatter ? 'Seconds before the same chatter sets it off again. 0 is none.' : 'Nobody sets this one off, so only the channel cooldown applies.'"
          >
            <template #default="{ id }"><VxStepper :id="id" v-model="form.userCooldown" :min="0" :max="86400" :step="5" :disabled="!hasChatter" /></template>
          </VxField>
        </div>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="pack-trigger-form" variant="primary" :loading="busy.has('pt-save')" :disabled="!body">{{ editing ? 'Save' : 'Add' }}</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="deleting !== null" :title="`Delete ${pack.name} trigger ${deleting}?`" @update:open="(v: boolean) => { if (!v) deleting = null }">
      It stops firing everywhere at once. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('pt-del')"
          @click="act('pt-del', () => admin.deletePackTrigger(pack.name, deleting!), `${pack.name} trigger ${deleting} deleted`).then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
  </div>
</template>

<style scoped>
.pack-triggers { margin-top: 12px; }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.head h3 { margin: 0; }
.intro { margin: 0 0 10px; }
.every { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cooldowns { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
</style>
