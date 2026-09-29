<script setup lang="ts">
// The users the bot ignores in a channel (and everywhere): their messages are logged but never run commands.
import { VxButton, VxCheckbox, VxChip, VxDialog, VxField, VxInput, timeAgo } from '@vexoulz/ui'
import { reactive, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import { can, isMe } from '@/lib/access'
import { admin, type Ignored } from '@/lib/admin'
import { useAct } from '@/lib/useAct'

const props = defineProps<{ login: string; sign: string; ignored: Ignored[]; reload: () => Promise<void> }>()
const { busy, act } = useAct(props.reload)

const ignoring = reactive({ login: '', reason: '', everywhere: false })
async function ignore() {
  const who = ignoring.login.trim().replace(/^@/, '')
  if (!who) return
  const ok = await act(
    'ignore',
    () => admin.ignore(props.login, { login: who, everywhere: ignoring.everywhere, reason: ignoring.reason.trim() || undefined }),
    `Ignoring @${who}${ignoring.everywhere ? ' everywhere' : ''}`,
  )
  if (!ok) return
  ignoring.login = ''
  ignoring.reason = ''
}
const name = (u: Ignored) => (u.login ? `@${u.login}` : u.userId)
/** A moderator lifts ignores in this channel, an admin also bot-wide ones; anyone may lift their own self-ignore. */
const mayLift = (u: Ignored) => (u.self && isMe(u.userId)) || (can('ignored.edit', props.login) && (!u.everywhere || can('ignored.everywhere')))
const lifting = ref<Ignored | null>(null)
const lift = (u: Ignored) =>
  act('unignore', () => admin.unignore(props.login, u.userId, u.everywhere), `${name(u)} isn't ignored ${u.everywhere ? 'anywhere' : 'here'} any more`).then(
    (ok) => ok && (lifting.value = null),
  )
</script>

<template>
  <section class="mtab">
    <p class="vx-muted intro">
      Their messages are still logged but never run commands. Changed from chat with
      <ChatLine :lines="`${sign}ignore add <user>`" :sign="sign" />; chatters can opt out with
      <ChatLine :lines="`${sign}ignore me`" :sign="sign" /> and take it back with
      <ChatLine :lines="`${sign}unignore me`" :sign="sign" />.
    </p>
    <div class="table-scroll vx-panel">
      <table class="vx-table">
        <thead><tr><th>User</th><th>Where</th><th>Ignored by</th><th>When</th><th>Reason</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in ignored" :key="`${u.everywhere}${u.userId}`">
            <td>
              <span v-if="u.login">@{{ u.login }}</span>
              <span v-else class="vx-mono">{{ u.userId }}</span>
            </td>
            <td>{{ u.everywhere ? 'every channel' : 'this channel' }}</td>
            <td>
              <VxChip v-if="u.self" tone="accent" title="They asked for it, so they can undo it themselves">themselves</VxChip>
              <span v-else-if="u.addedByLogin">@{{ u.addedByLogin }}</span>
              <span v-else-if="u.addedBy" class="vx-mono">{{ u.addedBy }}</span>
              <span v-else class="vx-muted" title="Set with the admin password or an API key">admin</span>
            </td>
            <td class="vx-muted nowrap" :title="u.addedAt ? new Date(u.addedAt).toLocaleString() : undefined">{{ timeAgo(u.addedAt) }}</td>
            <td class="vx-muted wrap">{{ u.reason ?? '' }}</td>
            <td class="end">
              <VxButton v-if="u.self && isMe(u.userId)" size="sm" @click="lifting = u">Stop ignoring me</VxButton>
              <VxButton v-else-if="mayLift(u)" size="sm" variant="ghost" @click="lifting = u">Unignore</VxButton>
            </td>
          </tr>
          <tr v-if="!ignored.length"><td colspan="6" class="vx-muted">Nobody is ignored here.</td></tr>
        </tbody>
      </table>
    </div>
    <form v-if="can('ignored.edit', login)" class="add vx-panel" @submit.prevent="ignore">
      <VxField label="User">
        <template #default="{ id }"><VxInput :id="id" v-model="ignoring.login" mono placeholder="twitch login" /></template>
      </VxField>
      <VxField label="Reason" class="grow">
        <template #default="{ id }"><VxInput :id="id" v-model="ignoring.reason" placeholder="optional" /></template>
      </VxField>
      <VxCheckbox v-if="can('ignored.everywhere')" v-model="ignoring.everywhere" label="In every channel" />
      <VxButton type="submit" variant="primary" :loading="busy.has('ignore')" :disabled="!ignoring.login.trim()">Ignore</VxButton>
    </form>

    <VxDialog
      :open="lifting !== null"
      :title="lifting && isMe(lifting.userId) ? 'Stop ignoring you?' : `Unignore ${lifting ? name(lifting) : ''}?`"
      @update:open="(v: boolean) => { if (!v) lifting = null }"
    >
      <template v-if="lifting && isMe(lifting.userId)">The bot answers your commands here again.</template>
      <template v-else>The bot answers their commands {{ lifting?.everywhere ? 'in every channel' : 'here' }} again.</template>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="primary" :loading="busy.has('unignore')" @click="lift(lifting!)">Unignore</VxButton>
      </template>
    </VxDialog>
  </section>
</template>
