<script setup lang="ts">
// What the bot keeps about you: your variables (`chatter.*` everywhere, `channel.chatter.*` per channel, and your
// commands' `publisher.*`) with your storage use, or your runs in every channel, newest first. As in chat, you set
// and delete your own `chatter.*` (`!var set|del chatter.x`) and clear your own `channel.chatter.*` values.
import { VxButton, VxCallout, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSegmented, VxSkeleton, timeAgo } from '@vex/ui'
import { computed, reactive, ref } from 'vue'
import { useResource } from '@vex/ui/utils'
import { bytes, errorText } from '@vex/platform-web'
import ChatLine from '@/components/ChatLine.vue'
import { admin, type MyRun, type MyVariable, type Storage } from '@/lib/admin'
import { shown, typedValue } from '@/lib/format'
import { useAct } from '@/lib/useAct'

const props = defineProps<{ show: 'variables' | 'runs' }>()

const query = ref('')
const limit = ref('50')
const LIMITS = ['50', '200', '500'].map((v) => ({ value: v, label: v }))
const { data, error, loading, reload } = useResource(
  async () => {
    if (props.show !== 'variables') return { runs: (await admin.myRuns(Number(limit.value))).runs }
    // A bot without /me/storage still lists the variables.
    const [variables, storage] = await Promise.all([admin.myVariables(), admin.myStorage().catch(() => null)])
    return { variables: variables.variables, storage }
  },
  { source: () => `${props.show}:${limit.value}` },
)
const { busy, act } = useAct(reload)
const usage = (label: string, s: Storage) => `${label} ${bytes(s.used_bytes)} of ${bytes(s.quota_bytes)}`

// ── your own chatter.*: set, edit, delete ──
const draft = reactive({ open: false, name: '', value: '', existing: false })
function openSet(v?: MyVariable) {
  Object.assign(draft, { open: true, name: v?.name ?? '', value: v ? (typeof v.value === 'string' ? v.value : JSON.stringify(v.value)) : '', existing: !!v })
}
const draftName = computed(() => draft.name.trim().replace(/^chatter\./i, ''))
async function save() {
  if (!draftName.value) return
  if (await act('me-set', () => admin.setMyVariable(draftName.value, typedValue(draft.value)), `chatter.${draftName.value} saved`)) draft.open = false
}
const deleting = ref<MyVariable | null>(null)
const deletable = (v: MyVariable) => v.namespace === 'chatter' || (v.namespace === 'channel.chatter' && !!v.channel)
async function remove() {
  const v = deleting.value
  if (!v) return
  const run = v.namespace === 'chatter'
    ? () => admin.deleteMyVariable(v.name)
    : () => admin.deleteChatterVariable(v.channel!, v.keys?.[1] ?? '', v.name)
  if (await act('me-del', run, `${fullName(v)} deleted`)) deleting.value = null
}

const fullName = (v: MyVariable) => `${v.namespace}.${v.name}`
const variables = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value?.variables ?? []
  return q ? all.filter((v) => `${fullName(v)} ${v.channel ?? ''} ${shown(v.value)}`.toLowerCase().includes(q)) : all
})
const runs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value?.runs ?? []
  return q ? all.filter((r) => `${r.expr} ${r.channel ?? ''} ${r.message ?? ''} ${r.code ?? ''}`.toLowerCase().includes(q)) : all
})
const outcome = (r: MyRun): { label: string; tone: 'ok' | 'bad' | 'warn' } =>
  r.cancelled_reason ? { label: r.cancelled_reason, tone: 'warn' } : r.code ? { label: r.code, tone: 'bad' } : { label: 'ok', tone: 'ok' }
</script>

<template>
  <section class="mtab">
    <div class="filters vx-form-row">
      <VxInput v-model="query" :placeholder="show === 'variables' ? 'Find a variable or value' : 'Find in expressions and errors'" aria-label="Find" class="grow" />
      <VxSegmented v-if="show === 'runs'" v-model="limit" :options="LIMITS" label="How many runs" />
      <VxButton :loading="loading" @click="reload">Refresh</VxButton>
    </div>
    <VxCallout v-if="error" tone="error" :title="`Couldn't load your ${show}`">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 5" :key="i" h="38px" /></div>

    <template v-else-if="show === 'variables'">
      <div class="head">
        <p class="vx-muted intro">
          Yours everywhere (<code>chatter.*</code>), yours in one channel (<code>channel.chatter.*</code>), and what your
          commands keep (<code>publisher.*</code>). Commands write them as they run. Anyone can read them, so keep
          nothing private here.
        </p>
        <VxButton size="sm" variant="primary" @click="openSet()">Set a variable</VxButton>
      </div>
      <p v-if="data.storage" class="vx-muted small">
        Storage: {{ usage('yours', data.storage.chatter) }} · {{ usage('your commands', data.storage.publisher) }}.
      </p>
      <VxEmptyState v-if="!data.variables?.length" title="No variables yet" text="They appear once a command saves something for you." />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Name</th><th>Where</th><th>Value</th><th>Changed</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(v, i) in variables" :key="`${fullName(v)}:${v.channel}:${i}`">
              <td class="vx-mono nowrap">{{ fullName(v) }}</td>
              <td class="vx-muted">{{ v.channel ? `#${v.channel}` : 'everywhere' }}</td>
              <td class="vx-mono wrap value">{{ shown(v.value) }}</td>
              <td class="vx-muted nowrap" :title="v.updated_at ? new Date(v.updated_at).toLocaleString() : undefined">{{ timeAgo(v.updated_at) }}</td>
              <td class="end">
                <VxButton v-if="v.namespace === 'chatter'" size="sm" variant="ghost" @click="openSet(v)">Edit</VxButton>
                <VxButton v-if="deletable(v)" size="sm" variant="ghost" @click="deleting = v">Delete</VxButton>
              </td>
            </tr>
            <tr v-if="!variables.length"><td colspan="5" class="vx-muted">Nothing matches “{{ query }}”.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <VxEmptyState v-if="!data.runs?.length" title="Nothing ran for you yet" text="Commands you run in chat show up here, in every channel." />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>When</th><th>Channel</th><th>Expression</th><th>Outcome</th><th>Took</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in runs" :key="`${r.at}-${i}`">
              <td class="vx-muted nowrap" :title="new Date(r.at).toLocaleString()">{{ timeAgo(r.at) }}</td>
              <td class="vx-mono">#{{ r.channel ?? r.channel_id }}</td>
              <td class="wrap"><ChatLine :lines="r.expr" sign="!" context="body" /></td>
              <td class="wrap">
                <VxChip :tone="outcome(r).tone">{{ outcome(r).label }}</VxChip>
                <div v-if="r.message" class="vx-muted small">{{ r.message }}</div>
              </td>
              <td class="vx-muted nowrap">{{ r.duration_ms === null ? '' : `${r.duration_ms} ms` }}</td>
            </tr>
            <tr v-if="!runs.length"><td colspan="5" class="vx-muted">No run matches “{{ query }}”.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <VxDialog v-model:open="draft.open" :title="draft.existing ? `chatter.${draft.name}` : 'Set one of your variables'">
      <form id="me-var-form" class="dialog-form" @submit.prevent="save">
        <VxField v-if="!draft.existing" label="Name" help="Letters, digits and underscores; chatter. is added for you.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.name" mono placeholder="location" /></template>
        </VxField>
        <VxField label="Value" help="JSON when it reads as JSON (3, true, [1, 2], {&quot;a&quot;: 1}); anything else is saved as text.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.value" mono /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="me-var-form" variant="primary" :loading="busy.has('me-set')" :disabled="!draftName">Save</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="deleting !== null" :title="`Delete ${deleting ? fullName(deleting) : ''}?`" @update:open="(v: boolean) => { if (!v) deleting = null }">
      <template v-if="deleting">
        Commands that read it get nothing from now on<template v-if="deleting.channel"> in #{{ deleting.channel }}</template>. This can't be undone.
      </template>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="busy.has('me-del')" @click="remove">Delete</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.value { max-width: 28rem; font-size: 12.5px; }
.head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 8px; }
.head .intro { flex: 1 1 20rem; margin: 0; }
</style>
