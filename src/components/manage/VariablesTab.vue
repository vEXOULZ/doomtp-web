<script setup lang="ts">
// Every variable kept in a channel, one namespace at a time, as `!var list` reads them: the channel's own
// (`channel.*`), each chatter's (`channel.chatter.*`, with a leaderboard like `!var top`), and what published commands
// keep here (`publisher.channel.*`, `publisher.channel.chatter.*`), with how much storage they use. Whoever reaches
// the channel's "write channel variables" role sets and deletes `channel.*`; a chatter's value is cleared by them or
// by the "manage variables" role, as `!var del … @user` does. Nobody edits someone else's.
import { VxButton, VxCallout, VxDialog, VxEmptyState, VxField, VxInput, VxProgress, VxSelect, VxSkeleton, timeAgo } from '@vex/ui'
import { computed, reactive, ref, watch } from 'vue'
import { useResource } from '@vex/ui/utils'
import { bytes, errorText } from '@vex/platform-web'
import { reachesRole } from '@/lib/access'
import { admin, type ChannelNamespace, type NamespacedVariable, type Variable } from '@/lib/admin'
import type { Role } from '@/lib/api'
import { shown, typedValue } from '@/lib/format'
import { session } from '@/lib/session'
import { useAct } from '@/lib/useAct'
import UserRef from '../UserRef.vue'

const props = defineProps<{
  login: string
  /** The channel's `channel_var_write_role`. */
  writeRole: string
  /** The channel's `var_admin_role`. */
  adminRole: string
  roles: Role[]
}>()

type View = ChannelNamespace | 'top'
const VIEWS: { value: View; label: string; text: string }[] = [
  { value: 'channel', label: 'channel.*', text: "The channel's own: commands and moderators set them, everyone reads them." },
  {
    value: 'channel.chatter',
    label: 'channel.chatter.*',
    text: 'One value per chatter in this channel. Each chatter changes their own; the manage-variables role can clear anyone’s.',
  },
  { value: 'top', label: 'Leaderboard', text: 'The chatters with the highest number in one channel.chatter variable, as !var top shows it.' },
  {
    value: 'publisher.channel',
    label: 'publisher.channel.*',
    text: 'What published commands keep for this channel, by the command’s owner: only their commands change it.',
  },
  {
    value: 'publisher.channel.chatter',
    label: 'publisher.channel.chatter.*',
    text: 'What published commands keep per chatter in this channel, by the command’s owner.',
  },
]
const view = ref<View>('channel')
const viewText = computed(() => VIEWS.find((v) => v.value === view.value)?.text ?? '')

const { data, error, reload } = useResource(async () => {
  const [variables, storage] = await Promise.all([admin.variables(props.login), admin.storage(props.login)])
  return { variables: variables.variables, storage }
}, { source: () => props.login })
const { busy, act } = useAct(reload)
const mayWrite = computed(() => reachesRole(props.login, props.writeRole, props.roles))
const mayReset = computed(() => reachesRole(props.login, props.adminRole, props.roles))

const query = ref('')
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value?.variables ?? []
  return q ? all.filter((v) => v.name.toLowerCase().includes(q) || shown(v.value).toLowerCase().includes(q)) : all
})
const spaces = computed(() => Object.entries(data.value?.storage.namespaces ?? {}).sort((a, b) => b[1] - a[1]))

// ── setting one: a new name, or a row's Edit ──
const draft = reactive({ open: false, name: '', value: '', existing: false })
function openSet(v?: Variable) {
  Object.assign(draft, { open: true, name: v?.name ?? '', value: v ? (typeof v.value === 'string' ? v.value : JSON.stringify(v.value)) : '', existing: !!v })
}
const name = computed(() => draft.name.trim().replace(/^channel\./i, ''))
async function save() {
  if (!name.value) return
  if (await act('v-set', () => admin.setVariable(props.login, name.value, typedValue(draft.value)), `channel.${name.value} saved`)) draft.open = false
}
const deleting = ref<string | null>(null)

// ── the other namespaces: filtered on the bot, a page at a time ──
const PAGE = 100
const filter = reactive({ name: '', user: '', publisher: '' })
const applied = ref({ ...filter })
const other = reactive<{ rows: NamespacedVariable[]; more: boolean; loading: boolean; error: unknown }>({ rows: [], more: false, loading: false, error: null })
const perChatter = computed(() => view.value === 'channel.chatter' || view.value === 'publisher.channel.chatter')
const byCommand = computed(() => view.value.startsWith('publisher'))
const bare = (s: string) => s.trim().replace(/^@/, '').toLowerCase()

async function loadOther(more = false) {
  if (view.value === 'channel' || view.value === 'top') return
  other.loading = true
  other.error = null
  try {
    const f = applied.value
    const found = await admin.variablesIn(props.login, {
      ns: view.value,
      name: bare(f.name) || undefined,
      user: perChatter.value ? bare(f.user) || undefined : undefined,
      publisher: byCommand.value ? bare(f.publisher) || undefined : undefined,
      limit: PAGE,
      offset: more ? other.rows.length : 0,
    })
    other.rows = more ? [...other.rows, ...found.variables] : found.variables
    other.more = found.has_more
  } catch (e) {
    other.error = e
  } finally {
    other.loading = false
  }
}
function show() {
  applied.value = { ...filter }
  if (view.value === 'top') loadTop()
  else loadOther()
}
watch([view, () => props.login], () => {
  other.rows = []
  top.rows = null
  show()
})
const prefix = (ns: string) => `${ns}.`

// ── clearing a chatter's value ──
const clearing = ref<NamespacedVariable | null>(null)
const mayClear = (v: NamespacedVariable) => view.value === 'channel.chatter' && (mayReset.value || (!!session.user && v.chatter_id === session.user.id))
async function clear() {
  const v = clearing.value
  if (!v?.chatter_id) return
  const who = v.chatter_login ? `@${v.chatter_login}` : v.chatter_id
  if (await act('v-clear', () => admin.deleteChatterVariable(props.login, v.chatter_id!, v.name), `channel.chatter.${v.name} cleared for ${who}`)) {
    other.rows = other.rows.filter((r) => r !== v)
    clearing.value = null
  }
}

// ── leaderboard ──
const COUNTS = [5, 10, 25].map((n) => ({ value: String(n), label: `Top ${n}` }))
const count = ref('10')
const top = reactive<{ rows: { rank: number; chatter_id: string; chatter_login: string | null; value: unknown }[] | null; loading: boolean; error: unknown }>({ rows: null, loading: false, error: null })
async function loadTop() {
  const wanted = bare(filter.name).replace(/^channel\.chatter\./, '')
  if (!wanted) return
  top.loading = true
  top.error = null
  try {
    top.rows = (await admin.variableTop(props.login, wanted, Number(count.value))).top
  } catch (e) {
    top.error = e
  } finally {
    top.loading = false
  }
}
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load the variables">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 5" :key="i" h="38px" /></div>
    <template v-else>
      <div class="storage vx-panel">
        <div class="meter">
          <span>Storage</span>
          <span class="vx-muted">{{ bytes(data.storage.used_bytes) }} of {{ bytes(data.storage.quota_bytes) }}</span>
        </div>
        <VxProgress :value="data.storage.used_bytes" :max="Math.max(1, data.storage.quota_bytes)" label="Storage used" />
        <p class="vx-muted small limits">
          Up to {{ bytes(data.storage.value_cap_bytes) }} a value, {{ data.storage.list_items }} items a list and
          {{ data.storage.names_per_space }} names a namespace.
          <template v-if="spaces.length"> By namespace: {{ spaces.map(([n, b]) => `${n} ${bytes(b)}`).join(' · ') }}.</template>
        </p>
      </div>

      <div class="head">
        <VxSelect v-model="view" :options="VIEWS.map(({ value, label }) => ({ value, label }))" aria-label="Which variables" width="240px" />
        <VxButton v-if="view === 'channel' && mayWrite" size="sm" variant="primary" @click="openSet()">Set a variable</VxButton>
      </div>
      <p class="vx-muted intro small">
        {{ viewText }} Everything here is public. <RouterLink to="/docs/features#variables">Who reads and writes each namespace</RouterLink>.
      </p>

      <template v-if="view === 'channel'">
        <p v-if="!mayWrite" class="vx-muted intro small">Setting them here takes {{ writeRole }} or higher.</p>
        <VxEmptyState
          v-if="!data.variables.length"
          title="No channel variables yet"
          text="Custom commands set them with -> channel.name, for whoever the channel's settings allow."
        />
        <template v-else>
          <VxInput v-model="query" class="search" placeholder="Find a variable or value" aria-label="Find a variable" />
          <div class="table-scroll vx-panel">
            <table class="vx-table">
              <thead><tr><th>Name</th><th>Value</th><th>Changed</th><th>By</th><th></th></tr></thead>
              <tbody>
                <tr v-for="v in rows" :key="v.name">
                  <td class="vx-mono nowrap">channel.{{ v.name }}</td>
                  <td class="vx-mono wrap value">{{ shown(v.value) }}</td>
                  <td class="vx-muted nowrap" :title="v.updated_at ? new Date(v.updated_at).toLocaleString() : undefined">{{ timeAgo(v.updated_at) }}</td>
                  <td class="vx-muted vx-mono"><UserRef :id="v.updated_by" :login="v.updated_by_login" /></td>
                  <td class="end">
                    <template v-if="mayWrite">
                      <VxButton size="sm" variant="ghost" @click="openSet(v)">Edit</VxButton>
                      <VxButton size="sm" variant="ghost" @click="deleting = v.name">Delete</VxButton>
                    </template>
                  </td>
                </tr>
                <tr v-if="!rows.length"><td colspan="5" class="vx-muted">No variable matches “{{ query }}”.</td></tr>
              </tbody>
            </table>
          </div>
        </template>
      </template>

      <template v-else-if="view === 'top'">
        <form class="filters vx-form-row" @submit.prevent="show">
          <VxInput v-model="filter.name" mono class="grow" placeholder="points" aria-label="channel.chatter variable" />
          <VxSelect v-model="count" :options="COUNTS" aria-label="How many" width="110px" />
          <VxButton type="submit" :loading="top.loading" :disabled="!bare(filter.name)">Show</VxButton>
        </form>
        <VxCallout v-if="top.error" tone="error" title="Couldn't load the leaderboard">{{ errorText(top.error) }}</VxCallout>
        <p v-else-if="top.rows === null" class="vx-muted small">Name a channel.chatter variable that holds numbers.</p>
        <VxEmptyState v-else-if="!top.rows.length" title="Nobody has a number there yet" />
        <div v-else class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>#</th><th>Chatter</th><th>Value</th></tr></thead>
            <tbody>
              <tr v-for="r in top.rows" :key="r.chatter_id">
                <td class="vx-muted">{{ r.rank }}</td>
                <td class="vx-mono"><UserRef :id="r.chatter_id" :login="r.chatter_login" /></td>
                <td class="vx-mono">{{ shown(r.value) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template v-else>
        <form class="filters vx-form-row" @submit.prevent="show">
          <VxInput v-model="filter.name" mono class="grow" placeholder="Variable name" aria-label="Variable name" />
          <VxInput v-if="byCommand" v-model="filter.publisher" class="grow" placeholder="Command owner" aria-label="Command owner's login" />
          <VxInput v-if="perChatter" v-model="filter.user" class="grow" placeholder="Chatter" aria-label="Chatter's login" />
          <VxButton type="submit" :loading="other.loading">Show</VxButton>
        </form>
        <VxCallout v-if="other.error" tone="error" title="Couldn't load the variables">{{ errorText(other.error) }}</VxCallout>
        <div v-else-if="other.loading && !other.rows.length" class="loading" aria-busy="true"><VxSkeleton v-for="i in 3" :key="i" h="38px" /></div>
        <VxEmptyState v-else-if="!other.rows.length" title="Nothing here" text="Commands save these as chatters use them." />
        <template v-else>
          <div class="table-scroll vx-panel">
            <table class="vx-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th v-if="byCommand">Owner</th>
                  <th v-if="perChatter">Chatter</th>
                  <th>Value</th>
                  <th>Changed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(v, i) in other.rows" :key="`${v.publisher_id}:${v.chatter_id}:${v.name}:${i}`">
                  <td class="vx-mono nowrap">{{ prefix(view) }}{{ v.name }}</td>
                  <td v-if="byCommand" class="vx-mono"><UserRef :id="v.publisher_id" :login="v.publisher_login" /></td>
                  <td v-if="perChatter" class="vx-mono"><UserRef :id="v.chatter_id" :login="v.chatter_login" /></td>
                  <td class="vx-mono wrap value">{{ shown(v.value) }}</td>
                  <td class="vx-muted nowrap" :title="v.updated_at ? new Date(v.updated_at).toLocaleString() : undefined">{{ timeAgo(v.updated_at) }}</td>
                  <td class="end"><VxButton v-if="mayClear(v)" size="sm" variant="ghost" @click="clearing = v">Clear</VxButton></td>
                </tr>
              </tbody>
            </table>
          </div>
          <VxButton v-if="other.more" class="more" :loading="other.loading" @click="loadOther(true)">Load more</VxButton>
        </template>
      </template>
    </template>

    <VxDialog v-model:open="draft.open" :title="draft.existing ? `channel.${draft.name}` : 'Set a channel variable'">
      <form id="var-form" class="dialog-form" @submit.prevent="save">
        <VxField v-if="!draft.existing" label="Name" help="Letters, digits and underscores; channel. is added for you.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.name" mono placeholder="deaths" /></template>
        </VxField>
        <VxField label="Value" help="JSON when it reads as JSON (3, true, [1, 2], {&quot;a&quot;: 1}); anything else is saved as text.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.value" mono /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="var-form" variant="primary" :loading="busy.has('v-set')" :disabled="!name">Save</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="deleting !== null" :title="`Delete channel.${deleting}?`" @update:open="(v: boolean) => { if (!v) deleting = null }">
      Commands that read it get nothing from now on. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('v-del')"
          @click="act('v-del', () => admin.deleteVariable(login, deleting!), `channel.${deleting} deleted`).then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="clearing !== null" :title="`Clear channel.chatter.${clearing?.name}?`" @update:open="(v: boolean) => { if (!v) clearing = null }">
      <template v-if="clearing">
        <UserRef :id="clearing.chatter_id" :login="clearing.chatter_login" /> loses this value here, as
        <code>!var del channel.chatter.{{ clearing.name }} @{{ clearing.chatter_login ?? clearing.chatter_id }}</code> does. This can't be undone.
      </template>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="busy.has('v-clear')" @click="clear">Clear</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.storage { display: grid; gap: 8px; padding: 14px 16px; }
.meter { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
.limits { margin: 0; }
.value { max-width: 28rem; font-size: 12.5px; }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 18px; }
.filters { margin-bottom: 10px; }
.more { margin-top: 10px; }
</style>
