<script setup lang="ts">
// "View as", for bot admins (lib/viewAs.ts): the banner under the header while the site is previewed as another
// role, and the picker that starts or changes a preview (opened here or from the account menu).
import { VxButton, VxCallout, VxDialog, VxField, VxSelect } from '@vexoulz/ui'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { admin, type Channel, type ChannelRoles } from '@/lib/admin'
import { errorText } from '@vexoulz/platform-web'
import { customRank } from '@/lib/ranks'
import { mayViewAs, previewing, viewAs } from '@/lib/session'
import { describe, picker, type Preview, type PreviewRole } from '@/lib/viewAs'

const route = useRoute()
const router = useRouter()

const ROLES: { value: PreviewRole; label: string; sub?: string }[] = [
  { value: 'signed-out', label: 'Signed out' },
  { value: 'user', label: 'Plain user' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'broadcaster', label: 'Broadcaster' },
  { value: 'custom', label: 'Custom role', sub: 'at its rank' },
]

const form = reactive({ role: 'moderator' as PreviewRole, channel: undefined as string | undefined, custom: undefined as string | undefined })
const needsChannel = computed(() => form.role !== 'signed-out' && form.role !== 'user')

const channels = ref<Channel[] | null>(null)
const roles = ref<ChannelRoles | null>(null)
const error = ref<string | null>(null)
const channelOptions = computed(() =>
  (channels.value ?? []).map((c) => ({ value: c.login, label: `#${c.login}`, sub: c.banned ? 'banned' : c.tier })),
)
// The channel's roles at a custom role's rank (the bot's /roles range), less moderator, which the other choice covers.
const roleOptions = computed(() =>
  (roles.value?.roles ?? [])
    .filter((r) => customRank(r.rank) && r.name !== 'moderator')
    .map((r) => ({ value: r.name, label: r.name, sub: `rank ${r.rank}${r.global ? ' · global' : ''}` })),
)

// Opening the picker starts from the current preview, and loads the channels once.
watch(
  () => picker.open,
  async (open) => {
    if (!open) return
    const p = previewing()
    if (p) Object.assign(form, { role: p.role, channel: p.channel ?? undefined, custom: p.role === 'custom' ? p.name : undefined })
    error.value = null
    if (channels.value) return
    try {
      channels.value = (await admin.channels(true)).channels.sort((a, b) => a.login.localeCompare(b.login))
    } catch (e) {
      error.value = errorText(e)
    }
  },
)
// A custom role is one of the chosen channel's.
watch(
  () => [form.role, form.channel] as const,
  async ([role, channel]) => {
    roles.value = null
    if (role !== 'custom' || !channel) return
    try {
      const got = await admin.roles(channel, true)
      if (form.channel === channel) roles.value = got
    } catch (e) {
      error.value = errorText(e)
    }
  },
)

const chosen = computed<Preview | null>(() => {
  if (!needsChannel.value) return { role: form.role, channel: null }
  const channel = form.channel
  if (!channel) return null
  if (form.role === 'moderator' || form.role === 'broadcaster') return { role: form.role, channel }
  const role = roles.value?.roles.find((r) => r.name === form.custom)
  return role ? { role: 'custom', channel, rank: role.rank, name: role.name } : null
})

// The bot works out the previewed session first; one it refuses keeps the picker open with its reason. A new preview
// remounts the page and this bar with it (App.vue keys it), so the picker closes through its shared state.
const starting = ref(false)
async function start() {
  if (!chosen.value) return
  starting.value = true
  error.value = null
  try {
    await viewAs(chosen.value)
    picker.open = false
    settle()
  } catch (e) {
    error.value = errorText(e)
  } finally {
    starting.value = false
  }
}
function exit() {
  void viewAs(null)
}
// A signed-out preview has no Manage pages (the router guard sends them home); leave the one open now too.
function settle() {
  if (previewing()?.role === 'signed-out' && route.path.startsWith('/manage')) router.push('/')
}
</script>

<template>
  <template v-if="mayViewAs()">
    <VxCallout v-if="previewing()" tone="warn" class="bar" :title="`Viewing as ${describe(previewing()!)}`">
      <div class="row">
        <span>Read-only: the bot answers as it would answer them, and refuses changes until you exit.</span>
        <span class="actions">
          <VxButton size="sm" @click="picker.open = true">Change</VxButton>
          <VxButton size="sm" variant="primary" @click="exit">Exit preview</VxButton>
        </span>
      </div>
    </VxCallout>

    <VxDialog v-model:open="picker.open" title="View the site as…">
      <form class="pick" @submit.prevent>
        <p class="vx-muted small">
          The bot answers every page as it would answer that role, and refuses changes while you preview.
        </p>
        <VxField label="Role">
          <template #default="{ id }">
            <VxSelect :id="id" v-model="form.role" :options="ROLES" width="100%" />
          </template>
        </VxField>
        <VxField v-if="needsChannel" label="Channel">
          <template #default="{ id }">
            <VxSelect :id="id" v-model="form.channel" :options="channelOptions" placeholder="Channel…" width="100%" />
          </template>
        </VxField>
        <VxField v-if="form.role === 'custom' && form.channel" label="Role in that channel">
          <template #default="{ id }">
            <VxSelect
              v-if="roleOptions.length"
              :id="id"
              v-model="form.custom"
              :options="roleOptions"
              placeholder="Custom role…"
              width="100%"
            />
            <p v-else-if="roles" class="vx-muted small">#{{ form.channel }} has no custom roles.</p>
            <p v-else class="vx-muted small">Loading its roles…</p>
          </template>
        </VxField>
        <VxCallout v-if="error" tone="error" title="Couldn't preview">{{ error }}</VxCallout>
      </form>
      <template #actions="{ close }">
        <VxButton v-if="previewing()" @click="exit(); close()">Exit preview</VxButton>
        <VxButton variant="primary" :disabled="!chosen" :loading="starting" @click="start">View as</VxButton>
      </template>
    </VxDialog>
  </template>
</template>

<style scoped>
.bar { margin: 0 0 12px; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.actions { display: flex; gap: 8px; margin-left: auto; }
.pick { display: flex; flex-direction: column; gap: 14px; }
.small { font-size: 13px; margin: 0; }
</style>
