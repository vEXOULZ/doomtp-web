<script setup lang="ts">
// A channel's settings as a form: only what changed is sent, as one PATCH, the same change `config` makes in chat.
import { VxButton, VxField, VxInput, VxSegmented, VxSelect, VxStepper, VxSwitch, useToast } from '@vexoulz/ui'
import { computed, reactive, shallowRef, watch } from 'vue'
import { can } from '@/lib/access'
import { admin, type Channel, type ChannelPatch } from '@/lib/admin'
import { errorText } from '@vexoulz/platform-web'

const props = defineProps<{ channel: Channel; roles: string[] }>()
const emit = defineEmits<{ saved: [channel: Channel] }>()
const toast = useToast()

const fromChannel = (c: Channel) => ({
  prefix: c.prefix,
  log_enabled: c.log_enabled,
  history_backfill: c.history_backfill,
  // Older bots don't know it; the switch is hidden then, so it's never sent.
  public_log: c.public_log ?? true,
  error_replies: !c.quiet_errors,
  cc_edit_notice: c.cc_edit_notice,
  reply_hold_ms: c.reply_hold_ms,
  timezone: c.timezone,
  automod_action: c.automod.action,
  automod_timeout_s: c.automod.timeout_s,
  channel_var_write_role: c.roles.channel_var_write,
  grant_min_role: c.roles.grant_min,
  publish_min_role: c.roles.publish_min,
  create_min_role: c.roles.create_min,
  var_admin_role: c.roles.var_admin,
})
type Form = ReturnType<typeof fromChannel>
const form = reactive<Form>(fromChannel(props.channel))
// What the bot has now: a change is anything the form holds that differs from it.
const saved = shallowRef<Form>(fromChannel(props.channel))
watch(
  () => props.channel,
  (c) => {
    saved.value = fromChannel(c)
    Object.assign(form, saved.value)
  },
)

const patch = computed<ChannelPatch>(() => {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(form) as (keyof Form)[]) {
    if (form[key] === saved.value[key]) continue
    if (key === 'error_replies') out.quiet_errors = !form.error_replies
    else out[key] = form[key]
  }
  return out as ChannelPatch
})
const dirty = computed(() => Object.keys(patch.value).length > 0)
const state = reactive({ busy: false, error: null as string | null })

async function save() {
  if (!dirty.value || state.busy) return
  if (!form.prefix.trim()) {
    state.error = 'The sign can’t be empty.'
    return
  }
  state.busy = true
  state.error = null
  try {
    const channel = await admin.patch(props.channel.login, patch.value)
    toast.show('Settings saved')
    emit('saved', channel)
  } catch (e) {
    state.error = errorText(e)
  } finally {
    state.busy = false
  }
}
function reset() {
  Object.assign(form, saved.value)
  state.error = null
}

const setRole = (key: keyof Form, role: string) => Object.assign(form, { [key]: role })
const roleOptions = computed(() => props.roles.map((r) => ({ value: r, label: r })))
const AUTOMOD = [
  { value: 'off', label: 'Off' },
  { value: 'delete', label: 'Delete' },
  { value: 'timeout', label: 'Timeout' },
]
const ROLE_FIELDS: [keyof Form, string, string][] = [
  ['create_min_role', 'Create custom commands', 'cc add'],
  ['publish_min_role', 'Publish custom commands', 'cc publish'],
  ['grant_min_role', 'Grant roles', 'role grant'],
  ['channel_var_write_role', 'Write channel variables', '-> channel.x'],
  ['var_admin_role', 'Manage variables', 'var'],
]
</script>

<template>
  <form class="settings" @submit.prevent="save">
    <div class="group vx-panel">
      <h3 class="vx-eyebrow">Chat</h3>
      <VxField label="Command sign" help="What starts a command here: a character or an emoji.">
        <template #default="{ id }"><VxInput :id="id" v-model="form.prefix" mono class="sign" /></template>
      </VxField>
      <VxSwitch v-model="form.error_replies" label="Error replies: say why a command failed" />
      <VxSwitch v-model="form.cc_edit_notice" label="Edit notices: say when a custom command changes" />
      <VxField label="Reply hold" help="Wait this long before replying, so the reply lands after the message it answers.">
        <template #default="{ id }"><VxStepper :id="id" v-model="form.reply_hold_ms" :min="0" :max="5000" :step="100" unit="ms" /></template>
      </VxField>
      <VxField label="Time zone" help="For {$now.*} and timers, as an IANA name like Europe/Lisbon.">
        <template #default="{ id }"><VxInput :id="id" v-model="form.timezone" mono /></template>
      </VxField>
    </div>

    <div class="group vx-panel">
      <h3 class="vx-eyebrow">Logging</h3>
      <VxSwitch v-model="form.log_enabled" :disabled="!can('settings.logging', channel.login)" label="Keep a chat log (for search and logsearch)" />
      <VxSwitch v-model="form.history_backfill" :disabled="!can('settings.backfill', channel.login)" label="Backfill: fill gaps from a history service" />
      <VxSwitch
        v-if="channel.public_log !== undefined"
        v-model="form.public_log"
        :disabled="!can('settings.public-log', channel.login)"
        label="Public log: anyone may search the messages (off: moderators only)"
      />
      <p v-if="!can('settings.logging', channel.login)" class="vx-muted locked">Only the broadcaster turns the chat log on or off.</p>
      <h3 class="vx-eyebrow">Automod</h3>
      <VxField label="Messages the word filter blocks">
        <template #default><VxSegmented v-model="form.automod_action" :options="AUTOMOD" label="Automod action" /></template>
      </VxField>
      <VxField v-if="form.automod_action === 'timeout'" label="Timeout length">
        <template #default="{ id }"><VxStepper :id="id" v-model="form.automod_timeout_s" :min="1" :max="1209600" :step="60" unit="s" /></template>
      </VxField>
    </div>

    <div class="group vx-panel">
      <h3 class="vx-eyebrow">Who may</h3>
      <p v-if="!can('settings.roles', channel.login)" class="vx-muted locked">Only the broadcaster changes these.</p>
      <div v-for="[key, label, hint] in ROLE_FIELDS" :key="key" class="role">
        <span>{{ label }} <code class="vx-muted">{{ hint }}</code></span>
        <VxSelect
          :model-value="String(form[key])"
          :options="roleOptions"
          :disabled="!can('settings.roles', channel.login)"
          size="sm"
          width="180px"
          align="right"
          @update:model-value="(v: string | undefined) => v && setRole(key, v)"
        />
      </div>
    </div>

    <div class="bar">
      <span v-if="state.error" class="err" role="alert">{{ state.error }}</span>
      <span v-else-if="dirty" class="vx-muted">Unsaved changes</span>
      <span class="spacer"></span>
      <VxButton :disabled="!dirty || state.busy" @click="reset">Reset</VxButton>
      <VxButton type="submit" variant="primary" :loading="state.busy" :disabled="!dirty">Save</VxButton>
    </div>
  </form>
</template>

<style scoped>
.settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 12px; align-items: start; }
.group { display: grid; gap: 14px; padding: 16px; }
.group h3 { margin: 0; }
.group h3:not(:first-child) { margin-top: 6px; }
.sign { max-width: 8rem; }
.role { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.role code { display: block; }
.role code { font-size: 12px; }
.bar {
  grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  position: sticky; bottom: 0; padding: 10px 0; background: var(--vx-bg);
}
.spacer { flex: 1; }
.err { color: var(--vx-bad); }
.locked { font-size: 12px; margin: 0; }
</style>
