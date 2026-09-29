<script setup lang="ts">
// Every command chat can run in a channel, and who may: on or off, the role it needs and its log level, as `cmd`
// does in chat.
import { VxButton, VxChip, VxDialog, VxField, VxInput, VxSegmented, VxSelect, VxSwitch } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import { can } from '@/lib/access'
import { admin } from '@/lib/admin'
import { LOG_LEVELS, type CommandRow, type CommandRulePatch } from '@/lib/modules'
import { onOff, useAct } from '@/lib/useAct'

const props = defineProps<{ login: string; sign: string; commands: CommandRow[]; roles: string[]; reload: () => Promise<void> }>()
const { busy, act } = useAct(props.reload)

const query = ref('')
const shown = computed(() => {
  const q = query.value.trim().toLowerCase().replace(/^[^\w]+/, '')
  return q ? props.commands.filter((c) => c.name.includes(q) || c.module.includes(q) || c.summary?.toLowerCase().includes(q)) : props.commands
})
const setCommand = (name: string, patch: CommandRulePatch, done: string) =>
  act(`c:${name}`, () => admin.setCommand(props.login, name, patch), done)
const who = (c: CommandRow) => (c.allowed_roles?.length ? c.allowed_roles.join(', ') : c.required_role ? `${c.required_role}+` : '—')
const cooldown = (c: CommandRow) =>
  Object.entries(c.cooldowns ?? {})
    .map(([role, cd]) => [cd.user_s && `${cd.user_s}s each`, cd.tier_s && `${cd.tier_s}s shared`].filter(Boolean).join(', ') + ` (${role})`)
    .join('; ')

// The rule editor: each field starts at "leave as is", so saving sends only what was picked.
const KEEP = 'keep'
const DEFAULT = 'default'
const editing = ref<CommandRow | null>(null)
const rule = reactive({ enabled: KEEP, role: KEEP, log: KEEP })
function edit(c: CommandRow) {
  Object.assign(rule, { enabled: KEEP, role: KEEP, log: KEEP })
  editing.value = c
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
  return out
})
async function save() {
  const c = editing.value
  if (!c || !Object.keys(patch.value).length) return
  if (await setCommand(c.name, patch.value, `${props.sign}${c.name} updated`)) editing.value = null
}
</script>

<template>
  <section class="mtab">
    <p class="vx-muted intro">
      Every command chat can run here, and who may. The same as
      <ChatLine :lines="`${sign}cmd disable <name>`" :sign="sign" /> in chat; a command whose module is off stays off
      whatever it says here.
    </p>
    <VxInput v-model="query" class="search" placeholder="Find a command or module" aria-label="Find a command" />
    <div class="table-scroll vx-panel">
      <table class="vx-table rules">
        <thead><tr><th>Command</th><th>Module</th><th>Who may</th><th>Cooldown</th><th>On</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in shown" :key="c.name">
            <td>
              <ChatLine :lines="`${sign}${c.name}`" :sign="sign" />
              <div v-if="c.summary" class="vx-muted small">{{ c.summary }}</div>
              <VxChip v-if="c.missing?.length" tone="bad" :title="`The bot needs the ${c.missing.join(', ')} permission on Twitch here`">needs {{ c.missing.join(', ') }}</VxChip>
            </td>
            <td class="vx-mono vx-muted">{{ c.module }}</td>
            <td class="nowrap">{{ who(c) }}</td>
            <td class="vx-muted small">{{ cooldown(c) || '—' }}</td>
            <td class="nowrap">
              <span v-if="!c.toggleable" class="vx-muted small">always on</span>
              <VxSwitch
                v-else
                :model-value="c.enabled"
                :disabled="!can('commands.edit', login) || busy.has(`c:${c.name}`)"
                @update:model-value="(on: boolean) => setCommand(c.name, { enabled: on }, `${sign}${c.name} turned ${onOff(on)}`)"
              ><span class="sr-only">Command {{ c.name }}</span></VxSwitch>
            </td>
            <td class="end"><VxButton v-if="can('commands.edit', login)" size="sm" variant="ghost" @click="edit(c)">Edit</VxButton></td>
          </tr>
          <tr v-if="!shown.length"><td colspan="6" class="vx-muted">No command matches “{{ query }}”.</td></tr>
        </tbody>
      </table>
    </div>

    <VxDialog :open="editing !== null" :title="editing ? `${sign}${editing.name} here` : ''" @update:open="(v: boolean) => { if (!v) editing = null }">
      <form v-if="editing" id="rule-form" class="dialog-form" @submit.prevent="save">
        <VxField v-if="editing.toggleable" :label="`On (now ${onOff(editing.enabled)})`" help="Default follows the module and the bot-wide setting.">
          <template #default><VxSegmented v-model="rule.enabled" :options="ENABLED_OPTIONS" label="Command on or off" /></template>
        </VxField>
        <VxField v-if="!editing.fixedPolicy" :label="`Who may run it (now ${who(editing)})`" :help="editing.allowed_roles?.length ? 'Picking a role replaces the list of roles above.' : undefined">
          <template #default="{ id }"><VxSelect :id="id" v-model="rule.role" :options="roleChoices" width="100%" /></template>
        </VxField>
        <VxField :label="editing.log_level ? `Log level (now ${editing.log_level})` : 'Log level'" help="What the bot logs when it runs here.">
          <template #default><VxSegmented v-model="rule.log" :options="LOG_OPTIONS" label="Log level" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="rule-form" variant="primary" :loading="!!editing && busy.has(`c:${editing.name}`)" :disabled="!Object.keys(patch).length">Save</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.rules td .vx-chip { margin-top: 4px; }
</style>
