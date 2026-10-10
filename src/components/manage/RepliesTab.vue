<script setup lang="ts">
// What the bot says instead of staying quiet: a reply when a command is on cooldown or someone may not run it
// (`callback`), and the channel's own wording for the readout commands (`customecho`). A reply is an expression,
// set for the whole channel, one module or one command; a readout is a template.
import { VxButton, VxCallout, VxDialog, VxEmptyState, VxField, VxInput, VxSegmented, VxSelect, VxSkeleton } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import ChatLine from '@/components/ChatLine.vue'
import { can } from '@/lib/access'
import { admin, CALLBACK_KINDS, type Callback } from '@/lib/admin'
import { useAct } from '@/lib/useAct'

const props = defineProps<{ login: string; sign: string; modules: string[]; commands: string[] }>()
const { data, error, reload } = useResource(async () => {
  const [callbacks, echo] = await Promise.all([admin.callbacks(props.login), admin.customecho(props.login)])
  return { callbacks: callbacks.callbacks, echo: echo.customecho }
}, { source: () => props.login })
const { busy, act } = useAct(reload)
const mayEdit = computed(() => can('commands.edit', props.login))

const KIND_LABEL: Record<string, string> = { on_cooldown: 'On cooldown', on_denied: 'Not allowed' }
const where = (scope: string) => {
  if (scope === 'channel') return 'every command'
  const [kind, name] = scope.split(':')
  return kind === 'module' ? `module ${name}` : `${props.sign}${name}`
}

// ── a reply ──
const reply = reactive({ open: false, existing: false, kind: 'on_cooldown', level: 'channel', target: '', expr: '' })
function openReply(c?: Callback) {
  const [level, target] = c ? (c.scope === 'channel' ? ['channel', ''] : c.scope.split(':')) : ['channel', '']
  Object.assign(reply, { open: true, existing: !!c, kind: c?.kind ?? 'on_cooldown', level, target, expr: c?.expr ?? '' })
}
const scope = computed(() => (reply.level === 'channel' ? 'channel' : reply.target ? `${reply.level}:${reply.target}` : ''))
const LEVELS = [
  { value: 'channel', label: 'Every command' },
  { value: 'module', label: 'One module' },
  { value: 'command', label: 'One command' },
]
const targets = computed(() => (reply.level === 'module' ? props.modules : props.commands).map((n) => ({ value: n, label: n })))
async function saveReply() {
  if (!scope.value || !reply.expr.trim()) return
  const done = await act('cb', () => admin.setCallback(props.login, reply.kind, scope.value, reply.expr.trim()), `${KIND_LABEL[reply.kind]} reply saved for ${where(scope.value)}`)
  if (done) reply.open = false
}

// ── a readout ──
const echo = reactive({ open: false, existing: false, name: '', text: '' })
function openEcho(e?: { command: string; template: string }) {
  Object.assign(echo, { open: true, existing: !!e, name: e?.command ?? '', text: e?.template ?? '' })
}
const echoName = computed(() => echo.name.trim().toLowerCase().replace(/^[^\w]+/, ''))
async function saveEcho() {
  if (!echoName.value || !echo.text.trim()) return
  if (await act('ce', () => admin.setCustomecho(props.login, echoName.value, echo.text.trim()), `${props.sign}${echoName.value} wording saved`)) echo.open = false
}
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load the replies">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 4" :key="i" h="38px" /></div>
    <template v-else>
      <div class="head">
        <h2 class="vx-eyebrow sub">Replies</h2>
        <VxButton v-if="mayEdit" size="sm" variant="primary" @click="openReply()">New reply</VxButton>
      </div>
      <p class="vx-muted intro">
        What the bot says when a command is on cooldown or someone may not run it, instead of staying quiet. The most
        specific one wins: a command's, then its module's, then the channel's. The same as
        <ChatLine :lines="`${sign}callback on_cooldown <expression>`" :sign="sign" /> in chat.
      </p>
      <VxEmptyState v-if="!data.callbacks.length" title="No replies" text="The bot stays quiet on cooldowns and refusals." />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>When</th><th>For</th><th>Says</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in data.callbacks" :key="`${c.kind}/${c.scope}`">
              <td class="nowrap">{{ KIND_LABEL[c.kind] ?? c.kind }}</td>
              <td class="vx-mono nowrap">{{ where(c.scope) }}</td>
              <td class="wrap"><ChatLine :lines="c.expr" :sign="sign" context="body" /></td>
              <td class="end">
                <template v-if="mayEdit">
                  <VxButton size="sm" variant="ghost" @click="openReply(c)">Edit</VxButton>
                  <VxButton
                    size="sm"
                    variant="ghost"
                    :loading="busy.has(`cb:${c.kind}/${c.scope}`)"
                    @click="act(`cb:${c.kind}/${c.scope}`, () => admin.deleteCallback(login, c.kind, c.scope), 'Reply removed')"
                  >Remove</VxButton>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="head">
        <h2 class="vx-eyebrow sub">Readouts</h2>
        <VxButton v-if="mayEdit" size="sm" variant="primary" @click="openEcho()">New wording</VxButton>
      </div>
      <p class="vx-muted intro">
        This channel's own wording for commands that read something out (a count, a time, a quote), as a template. The
        same as <ChatLine :lines="`${sign}customecho <command> <template>`" :sign="sign" /> in chat.
      </p>
      <VxEmptyState v-if="!data.echo.length" title="No custom wording" text="Readouts use their built-in wording." />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Command</th><th>Template</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in data.echo" :key="e.command">
              <td class="nowrap"><ChatLine :lines="`${sign}${e.command}`" :sign="sign" /></td>
              <td class="vx-mono wrap">{{ e.template }}</td>
              <td class="end">
                <template v-if="mayEdit">
                  <VxButton size="sm" variant="ghost" @click="openEcho(e)">Edit</VxButton>
                  <VxButton
                    size="sm"
                    variant="ghost"
                    :loading="busy.has(`ce:${e.command}`)"
                    @click="act(`ce:${e.command}`, () => admin.deleteCustomecho(login, e.command), `${sign}${e.command} back to its own wording`)"
                  >Remove</VxButton>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <VxDialog v-model:open="reply.open" :title="reply.existing ? 'Edit reply' : 'New reply'" width="560px">
      <form id="reply-form" class="dialog-form" @submit.prevent="saveReply">
        <VxField label="When">
          <template #default><VxSegmented v-model="reply.kind" :options="CALLBACK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))" label="When" /></template>
        </VxField>
        <template v-if="!reply.existing">
          <VxField label="For">
            <template #default><VxSegmented v-model="reply.level" :options="LEVELS" label="For" /></template>
          </VxField>
          <VxField v-if="reply.level !== 'channel'" :label="reply.level === 'module' ? 'Module' : 'Command'">
            <template #default="{ id }"><VxSelect :id="id" v-model="reply.target" :options="targets" width="100%" /></template>
          </VxField>
        </template>
        <p v-else class="vx-muted small">For {{ where(scope) }}.</p>
        <VxField label="Says" help="An expression, as a command's body: echo wait {$cooldown.user_remaining}s">
          <template #default="{ id }"><VxInput :id="id" v-model="reply.expr" mono placeholder="echo slow down" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="reply-form" variant="primary" :loading="busy.has('cb')" :disabled="!scope || !reply.expr.trim()">Save</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="echo.open" :title="echo.existing ? `${sign}${echo.name}` : 'New wording'" width="560px">
      <form id="echo-form" class="dialog-form" @submit.prevent="saveEcho">
        <VxField v-if="!echo.existing" label="Command">
          <template #default="{ id }"><VxInput :id="id" v-model="echo.name" mono placeholder="deaths" /></template>
        </VxField>
        <VxField label="Template" help="Text, with {…} for what the command reads out.">
          <template #default="{ id }"><VxInput :id="id" v-model="echo.text" mono /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="echo-form" variant="primary" :loading="busy.has('ce')" :disabled="!echoName || !echo.text.trim()">Save</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin: 18px 0 8px; }
.head:first-child { margin-top: 0; }
.head .sub { margin: 0; }
</style>
