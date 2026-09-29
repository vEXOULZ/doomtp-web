<script setup lang="ts">
// Every command chat can run in a channel, and who may: on or off, the role it needs (or exactly which roles), its
// cooldowns and log level, as `cmd` does in chat. Without a channel, the same rules bot-wide (the Bot page).
// It reads like the public command pages (CommandTable: a line opens its arguments, examples and body), with the
// rules in force here in place of the defaults and the switch and Edit on each line.
import { VxButton, VxCheckbox, VxChip, VxDialog, VxField, VxInput, VxSegmented, VxSelect, VxSwitch } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import CommandTable from '@/components/CommandTable.vue'
import { can } from '@/lib/access'
import { admin } from '@/lib/admin'
import { bareRow, type CommandRow as RefRow } from '@/lib/commands'
import { count } from '@/lib/format'
import { LOG_LEVELS, type CommandRow, type CommandRulePatch } from '@/lib/modules'
import { onOff, useAct } from '@/lib/useAct'

const props = defineProps<{
  /** Null: the bot-wide rules. */
  login: string | null
  sign: string
  commands: CommandRow[]
  /** What the public pages say about each command (built-ins and what is published), by name. */
  reference: RefRow[]
  /** The roles a rule can name: the built-in ones, then this channel's own. */
  roles: string[]
  reload: () => Promise<void>
}>()
const { busy, act } = useAct(props.reload)

// The public row for each command, with who may run it and its cooldowns as they are here.
const byName = computed(() => new Map(props.reference.map((r) => [r.name, r])))
const rows = computed(() =>
  props.commands.map((c): RefRow => {
    const base = byName.value.get(c.name) ?? bareRow(c.name, c.module, c.summary ?? '')
    return {
      ...base,
      key: c.name,
      module: c.module,
      summary: c.summary ?? base.summary,
      role: c.allowed_roles?.length || (c.required_role && c.required_role !== 'everyone') ? who(c) : 'everyone',
      cooldowns: Object.entries(c.cooldowns ?? {}).map(([role, cd]) => ({ role, shared: cd.tier_s, personal: cd.user_s })),
      alwaysOn: !c.toggleable,
      fixedPolicy: c.fixedPolicy,
    }
  }),
)
const rules = computed(() => new Map(props.commands.map((c) => [c.name, c])))
const ruleOf = (r: RefRow) => rules.value.get(r.key)!
const mayEdit = computed(() => (props.login ? can('commands.edit', props.login) : can('bot')))
const setCommand = (name: string, patch: CommandRulePatch, done: string) =>
  act(`c:${name}`, () => (props.login ? admin.setCommand(props.login, name, patch) : admin.setGlobalCommand(name, patch)), done)
const who = (c: CommandRow) => (c.allowed_roles?.length ? c.allowed_roles.join(', ') : c.required_role ? `${c.required_role}+` : '—')

// The rule editor: each field starts at "leave as is", so saving sends only what was picked.
const KEEP = 'keep'
const DEFAULT = 'default'
const editing = ref<CommandRow | null>(null)
const rule = reactive({ enabled: KEEP, role: KEEP, log: KEEP, allowed: KEEP, only: [] as string[] })
/** Cooldowns by role, as typed: a role taken out is sent as null. */
const cds = ref<{ role: string; user: string | number; tier: string | number }[]>([])
const newCd = ref('')
function edit(c: CommandRow) {
  Object.assign(rule, { enabled: KEEP, role: KEEP, log: KEEP, allowed: KEEP, only: [...(c.allowed_roles ?? [])] })
  cds.value = Object.entries(c.cooldowns ?? {}).map(([role, cd]) => ({ role, user: cd.user_s, tier: cd.tier_s }))
  newCd.value = ''
  clearing.value = false
  editing.value = c
}
const ALLOWED_OPTIONS = [
  { value: KEEP, label: 'As is' },
  { value: 'list', label: 'Only these roles' },
  { value: DEFAULT, label: 'Any role that ranks' },
]
function toggleOnly(role: string, on: boolean) {
  rule.only = on ? [...rule.only, role] : rule.only.filter((r) => r !== role)
}
const cdRoles = computed(() => props.roles.filter((r) => !cds.value.some((c) => c.role === r)).map((r) => ({ value: r, label: r })))
function addCd() {
  if (!newCd.value) return
  cds.value = [...cds.value, { role: newCd.value, user: 0, tier: 0 }]
  newCd.value = ''
}
const removeCd = (role: string) => (cds.value = cds.value.filter((c) => c.role !== role))
const cdBad = computed(() => cds.value.some((c) => count(c.user) === null || count(c.tier) === null))
const cooldownPatch = computed(() => {
  const before = editing.value?.cooldowns ?? {}
  const out: Record<string, { tier_s: number; user_s: number } | null> = {}
  for (const c of cds.value) {
    const user_s = count(c.user) ?? 0
    const tier_s = count(c.tier) ?? 0
    const was = before[c.role]
    if (!was || was.user_s !== user_s || was.tier_s !== tier_s) out[c.role] = { tier_s, user_s }
  }
  for (const role of Object.keys(before)) if (!cds.value.some((c) => c.role === role)) out[role] = null
  return out
})
// Clearing drops every rule this channel (or the bot) set, back to the defaults.
const clearing = ref(false)
async function clear() {
  const c = editing.value
  if (!c) return
  const run = () => (props.login ? admin.resetCommand(props.login, c.name) : admin.resetGlobalCommand(c.name))
  if (await act(`c:${c.name}`, run, `${props.sign}${c.name} back to its defaults`)) editing.value = null
}
const ENABLED_OPTIONS = [
  { value: KEEP, label: 'As is' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
  { value: DEFAULT, label: 'Default' },
]
const roleChoices = computed(() => {
  const current = editing.value?.required_role
  return [
    { value: KEEP, label: 'As is' },
    ...props.roles.map((r) => ({ value: r, label: `${r} and up` })),
    ...(current && !props.roles.includes(current) ? [{ value: current, label: `${current} and up` }] : []),
    { value: DEFAULT, label: 'Default (bot-wide or built-in)' },
  ]
})
const LOG_OPTIONS = [{ value: KEEP, label: 'As is' }, ...LOG_LEVELS.map((l) => ({ value: l, label: l }))]
const patch = computed<CommandRulePatch>(() => {
  const out: CommandRulePatch = {}
  if (rule.enabled !== KEEP) out.enabled = rule.enabled === DEFAULT ? null : rule.enabled === 'on'
  if (rule.role !== KEEP) out.required_role = rule.role === DEFAULT ? null : rule.role
  if (rule.log !== KEEP) out.log_level = rule.log as CommandRulePatch['log_level']
  if (rule.allowed === 'list' && rule.only.length) out.allowed_roles = [...rule.only]
  if (rule.allowed === DEFAULT) out.allowed_roles = null
  if (Object.keys(cooldownPatch.value).length) out.cooldowns = cooldownPatch.value
  return out
})
async function save() {
  const c = editing.value
  if (!c || !Object.keys(patch.value).length || cdBad.value) return
  if (await setCommand(c.name, patch.value, `${props.sign}${c.name} updated`)) editing.value = null
}
</script>

<template>
  <section class="mtab">
    <p v-if="!login" class="vx-muted intro">
      The rules every channel starts from; a channel's own rule for a command wins over the one here.
    </p>
    <p v-else class="vx-muted intro">
      Every command chat can run here, and who may. The same as
      <ChatLine :lines="`${sign}cmd disable <name>`" :sign="sign" /> in chat; a command whose module is off stays off
      whatever it says here.
    </p>
    <CommandTable :rows="rows" :sign="sign" actions-label="On">
      <template #note="{ row }">
        <VxChip
          v-if="ruleOf(row).missing?.length"
          tone="bad"
          :title="`The bot needs the ${ruleOf(row).missing!.join(', ')} permission on Twitch here`"
        >needs {{ ruleOf(row).missing!.join(', ') }}</VxChip>
      </template>
      <template #actions="{ row }">
        <span v-if="!ruleOf(row).toggleable" class="vx-muted small nowrap">always on</span>
        <VxSwitch
          v-else
          :model-value="ruleOf(row).enabled"
          :disabled="!mayEdit || busy.has(`c:${row.key}`)"
          @update:model-value="(on: boolean) => setCommand(row.key, { enabled: on }, `${sign}${row.key} turned ${onOff(on)}`)"
        ><span class="sr-only">Command {{ row.key }}</span></VxSwitch>
        <VxButton v-if="mayEdit" size="sm" variant="ghost" @click="edit(ruleOf(row))">Edit</VxButton>
      </template>
      <template #detail="{ row }">
        <div class="chips">
          <VxChip k="on here">{{ ruleOf(row).toggleable ? onOff(ruleOf(row).enabled) : 'always' }}</VxChip>
          <VxChip v-if="ruleOf(row).log_level" k="log level">{{ ruleOf(row).log_level }}</VxChip>
          <VxChip v-if="ruleOf(row).requires?.length" k="Twitch permission">{{ ruleOf(row).requires!.join(', ') }}</VxChip>
        </div>
      </template>
    </CommandTable>

    <VxDialog :open="editing !== null" :title="editing ? `${sign}${editing.name} here` : ''" @update:open="(v: boolean) => { if (!v) editing = null }">
      <form v-if="editing" id="rule-form" class="dialog-form" @submit.prevent="save">
        <VxField v-if="editing.toggleable" :label="`On (now ${onOff(editing.enabled)})`" help="Default follows the module and the bot-wide setting.">
          <template #default><VxSegmented v-model="rule.enabled" :options="ENABLED_OPTIONS" label="Command on or off" /></template>
        </VxField>
        <VxField v-if="!editing.fixedPolicy" :label="`Who may run it (now ${who(editing)})`" :help="editing.allowed_roles?.length ? 'Picking a role replaces the list of roles above.' : undefined">
          <template #default="{ id }"><VxSelect :id="id" v-model="rule.role" :options="roleChoices" width="100%" /></template>
        </VxField>
        <VxField v-if="!editing.fixedPolicy" label="Only certain roles" :help="rule.allowed === 'list' ? 'Exactly these roles may run it, whatever their rank. Pick at least one.' : 'Instead of a rank, name exactly which roles may run it.'">
          <template #default>
            <VxSegmented v-model="rule.allowed" :options="ALLOWED_OPTIONS" label="Only certain roles" />
            <div v-if="rule.allowed === 'list'" class="only">
              <VxCheckbox v-for="r in roles" :key="r" :model-value="rule.only.includes(r)" :label="r" @update:model-value="(on: boolean) => toggleOnly(r, on)" />
            </div>
          </template>
        </VxField>
        <VxField v-if="!editing.fixedPolicy" label="Cooldowns" help="Per role, in seconds: how long each chatter waits, and how long everyone with that role waits after anyone runs it. 0 is none.">
          <template #default>
            <div class="cds">
              <div v-for="c in cds" :key="c.role" class="cd">
                <span class="vx-mono role">{{ c.role }}</span>
                <label>each <VxInput v-model="c.user" type="number" :invalid="count(c.user) === null" :aria-label="`${c.role}: seconds each chatter waits`" /></label>
                <label>shared <VxInput v-model="c.tier" type="number" :invalid="count(c.tier) === null" :aria-label="`${c.role}: seconds everyone waits`" /></label>
                <VxButton size="sm" variant="ghost" @click="removeCd(c.role)">Remove</VxButton>
              </div>
              <div v-if="cdRoles.length" class="cd">
                <VxSelect v-model="newCd" :options="cdRoles" placeholder="Add a role" width="180px" />
                <VxButton size="sm" :disabled="!newCd" @click="addCd">Add</VxButton>
              </div>
            </div>
          </template>
        </VxField>
        <VxField :label="editing.log_level ? `Log level (now ${editing.log_level})` : 'Log level'" help="What the bot logs when it runs here.">
          <template #default><VxSegmented v-model="rule.log" :options="LOG_OPTIONS" label="Log level" /></template>
        </VxField>
        <div v-if="clearing" class="clear vx-panel" role="alert">
          Drop every rule {{ login ? 'this channel' : 'the bot' }} set for {{ sign }}{{ editing.name }}, back to the defaults?
          <span class="clear-actions">
            <VxButton size="sm" @click="clearing = false">Keep them</VxButton>
            <VxButton size="sm" variant="danger-solid" :loading="busy.has(`c:${editing.name}`)" @click="clear">Clear</VxButton>
          </span>
        </div>
      </form>
      <template #actions="{ close }">
        <VxButton v-if="!clearing" variant="danger" class="clear-open" @click="clearing = true">Clear all rules</VxButton>
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          type="submit"
          form="rule-form"
          variant="primary"
          :loading="!!editing && busy.has(`c:${editing.name}`)"
          :disabled="!Object.keys(patch).length || cdBad || (rule.allowed === 'list' && !rule.only.length)"
        >Save</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.only { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; }
.cds { display: grid; gap: 6px; }
.cd { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.cd .role { min-width: 7rem; }
.cd label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--vx-muted); }
.cd label :deep(.vx-input) { width: 6rem; }
.clear { display: grid; gap: 8px; padding: 12px; border-color: var(--vx-bad); }
.clear-actions { display: flex; gap: 8px; }
.clear-open { margin-right: auto; }
</style>
