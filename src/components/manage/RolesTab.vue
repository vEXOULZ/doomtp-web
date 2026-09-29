<script setup lang="ts">
// A channel's custom roles and who holds them, as `role` manages them in chat: a role ranks between the built-in
// ones, commands can require it, and a member can hold it for a while or until removed. The bot decides what the
// session may touch (`manageable`): roles ranked below its own, any of them for the broadcaster.
import { VxButton, VxCallout, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSelect, VxSkeleton, VxStepper, timeAgo } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { can } from '@/lib/access'
import { admin } from '@/lib/admin'
import { api } from '@/lib/api'
import { useAct } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string; sign: string }>()
const { data, error, reload } = useLoad(async () => {
  const [roles, all] = await Promise.all([admin.roles(props.login), api.roles()])
  return { ...roles, range: all.custom_rank_range }
}, () => props.login)
const { busy, act } = useAct(reload)
const mayEdit = computed(() => can('commands.edit', props.login))

// ── a new role, ranked below the session's own unless it's the broadcaster (the bot checks) ──
const role = reactive({ name: '', rank: 50 })
const rankMax = computed(() => (data.value ? Math.min(data.value.range[1], Math.max(data.value.range[0], data.value.your_rank - 1)) : 99))
const validName = computed(() => /^[a-z0-9_]{1,32}$/.test(role.name.trim().toLowerCase()))
async function create() {
  const name = role.name.trim().toLowerCase()
  if (!validName.value) return
  if (await act('r-add', () => admin.createRole(props.login, name, role.rank), `Role ${name} created`)) role.name = ''
}
const ranked = computed(() =>
  [...(data.value?.builtin ?? []).map((b) => ({ ...b, builtin: true })), ...(data.value?.roles ?? []).map((r) => ({ name: r.name, rank: r.rank, builtin: false }))]
    .sort((a, b) => a.rank - b.rank),
)

// ── giving one to someone ──
const DURATIONS = [
  { value: 0, label: 'Until removed' },
  { value: 3600, label: 'An hour' },
  { value: 86400, label: 'A day' },
  { value: 7 * 86400, label: 'A week' },
  { value: 30 * 86400, label: '30 days' },
  { value: 366 * 86400, label: 'A year' },
]
const giving = reactive({ role: '', user: '', duration: 0 })
const givingOpen = ref(false)
function openGive(name: string) {
  Object.assign(giving, { role: name, user: '', duration: 0 })
  givingOpen.value = true
}
async function give() {
  const user = giving.user.trim().replace(/^@/, '').toLowerCase()
  if (!user) return
  const done = await act('r-give', () => admin.grantRole(props.login, giving.role, user, giving.duration || undefined), `@${user} is now ${giving.role}`)
  if (done) givingOpen.value = false
}
const deleting = ref<string | null>(null)
const expires = (at: number | null) => (at ? `until ${new Date(at).toLocaleString()}` : 'until removed')
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load the roles">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 4" :key="i" h="38px" /></div>
    <template v-else>
      <p class="vx-muted intro">
        Custom roles rank between the built-in ones, so a command can require one. The same as <code>{{ sign }}role</code>
        in chat. Your rank here is {{ data.your_rank }}.
      </p>
      <p class="vx-muted small ladder">
        <template v-for="(r, i) in ranked" :key="r.name"><template v-if="i"> · </template><span :class="{ custom: !r.builtin }">{{ r.name }} {{ r.rank }}</span></template>
      </p>

      <VxEmptyState v-if="!data.roles.length" title="No custom roles" :text="mayEdit ? 'Create one below.' : undefined" />
      <div v-for="r in data.roles" :key="r.name" class="role vx-panel">
        <div class="role-head">
          <span class="vx-mono name">{{ r.name }}</span>
          <VxChip k="rank">{{ r.rank }}</VxChip>
          <VxChip v-if="r.global">bot-wide</VxChip>
          <span class="grow"></span>
          <template v-if="r.manageable">
            <VxButton size="sm" @click="openGive(r.name)">Give to someone</VxButton>
            <VxButton v-if="!r.global" size="sm" variant="ghost" @click="deleting = r.name">Delete</VxButton>
          </template>
        </div>
        <table v-if="r.members.length" class="vx-table members">
          <tbody>
            <tr v-for="m in r.members" :key="m.user_id">
              <td class="vx-mono">@{{ m.login ?? m.user_id }}</td>
              <td class="vx-muted small" :title="expires(m.expires_at)">{{ m.expires_at ? `ends ${timeAgo(m.expires_at)}` : 'until removed' }}</td>
              <td class="end">
                <VxButton
                  v-if="r.manageable"
                  size="sm"
                  variant="ghost"
                  :loading="busy.has(`m:${r.name}:${m.user_id}`)"
                  @click="act(`m:${r.name}:${m.user_id}`, () => admin.revokeRole(login, r.name, m.login ?? m.user_id), `Took ${r.name} from @${m.login ?? m.user_id}`)"
                >Remove</VxButton>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="vx-muted small none">Nobody holds it.</p>
      </div>

      <form v-if="mayEdit" class="add vx-panel" @submit.prevent="create">
        <VxField label="New role" help="Lowercase letters, digits and _.">
          <template #default="{ id }"><VxInput :id="id" v-model="role.name" mono placeholder="regular" :invalid="!!role.name && !validName" /></template>
        </VxField>
        <VxField label="Rank" :help="`${data.range[0]} to ${rankMax}: below your own.`">
          <template #default="{ id }"><VxStepper :id="id" v-model="role.rank" :min="data.range[0]" :max="rankMax" :step="5" /></template>
        </VxField>
        <VxButton type="submit" variant="primary" :loading="busy.has('r-add')" :disabled="!validName">Create</VxButton>
      </form>
    </template>

    <VxDialog v-model:open="givingOpen" :title="`Give ${giving.role}`">
      <form id="give-form" class="dialog-form" @submit.prevent="give">
        <VxField label="Twitch user">
          <template #default="{ id }"><VxInput :id="id" v-model="giving.user" mono placeholder="login" /></template>
        </VxField>
        <VxField label="For">
          <template #default="{ id }"><VxSelect :id="id" v-model="giving.duration" :options="DURATIONS" width="100%" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="give-form" variant="primary" :loading="busy.has('r-give')" :disabled="!giving.user.trim()">Give</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="deleting !== null" :title="`Delete the ${deleting} role?`" @update:open="(v: boolean) => { if (!v) deleting = null }">
      Everyone holding it loses it, and commands that require it fall back to their other rules. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('r-del')"
          @click="act('r-del', () => admin.deleteRole(login, deleting!), `Role ${deleting} deleted`).then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.ladder { margin: 0 0 12px; }
.ladder .custom { color: var(--vx-accent); }
.role { padding: 12px 14px; margin-bottom: 10px; }
.role-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.role-head .name { font-size: 15px; }
.role-head .grow { flex: 1; }
.members { margin-top: 8px; }
.none { margin: 6px 0 0; }
</style>
