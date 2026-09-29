<script setup lang="ts">
// A word filter: a channel's own (with the bot-wide list it can't change, and a box to try a message on both), or,
// without a channel, the bot-wide list itself on the Bot page. The same entries `filter` adds and edits in chat.
import { VxButton, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSelect, VxSwitch, useToast } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { can } from '@/lib/access'
import { admin, type FilterBody, type FilterEntry, type FilterPatch, type FilterTest } from '@/lib/admin'
import { errorMessage } from '@/lib/api'
import { onOff, useAct } from '@/lib/useAct'

const props = defineProps<{
  /** Null: the bot-wide list. */
  login: string | null
  filters: FilterEntry[]
  globalFilters?: FilterEntry[]
  reload: () => Promise<void>
}>()
const { busy, act } = useAct(props.reload)
const toast = useToast()

const mayEdit = computed(() => (props.login ? can('filter.edit', props.login) : can('bot')))
const send = {
  add: (body: FilterBody) => (props.login ? admin.addFilter(props.login, body) : admin.addGlobalFilter(body)),
  edit: (id: number, patch: FilterPatch) => (props.login ? admin.editFilter(props.login, id, patch) : admin.editGlobalFilter(id, patch)),
  remove: (id: number) => (props.login ? admin.deleteFilter(props.login, id) : admin.deleteGlobalFilter(id)),
}

const KINDS = ['word', 'wildcard', 'regex', 'allow'].map((v) => ({ value: v, label: v }))
const ACTIONS = ['mask', 'replace', 'tag', 'block'].map((v) => ({ value: v, label: v }))
const blank = () => ({ pattern: '', kind: 'word', action: 'mask', category: '', replacement: '' })
const entry = reactive(blank())
async function add() {
  const pattern = entry.pattern.trim()
  if (!pattern) return
  const body: FilterBody = { ...entry, pattern, category: entry.category.trim(), replacement: entry.action === 'replace' ? entry.replacement : '' }
  if (await act('filter-add', () => send.add(body), `Added ${pattern}`)) Object.assign(entry, blank())
}
const deleting = ref<number | null>(null)

// ── editing one entry: only what changed is sent ──
const editing = ref<FilterEntry | null>(null)
const draft = reactive(blank())
function edit(f: FilterEntry) {
  Object.assign(draft, { pattern: f.pattern, kind: f.kind, action: f.action, category: f.category, replacement: f.replacement })
  editing.value = f
}
const changes = computed<FilterPatch>(() => {
  const f = editing.value
  if (!f) return {}
  const out: FilterPatch = {}
  for (const k of ['pattern', 'kind', 'action', 'category', 'replacement'] as const) {
    const v = k === 'pattern' || k === 'category' ? draft[k].trim() : draft[k]
    if (v !== (f[k] ?? '')) out[k] = v
  }
  return out
})
async function save() {
  const f = editing.value
  if (!f || !Object.keys(changes.value).length || !draft.pattern.trim()) return
  if (await act(`f:${f.id}`, () => send.edit(f.id, changes.value), `${draft.pattern.trim()} saved`)) editing.value = null
}

// ── trying a message ──
const sample = ref('')
const testing = ref(false)
const tested = ref<FilterTest | null>(null)
async function test() {
  if (!props.login || !sample.value.trim()) return
  testing.value = true
  try {
    tested.value = await admin.testFilter(props.login, sample.value)
  } catch (e) {
    tested.value = null
    toast.show(errorMessage(e), { kind: 'error', duration: 5000 })
  } finally {
    testing.value = false
  }
}
const automodSays = (t: FilterTest) => {
  if (!t.automod) return t.blocked ? 'Automod is off here, so the sender isn\'t punished.' : null
  const what = t.automod.action === 'timeout' ? `times the sender out for ${t.automod.seconds}s` : `${t.automod.action}s the sender`
  return `Automod ${what} (chatters below moderator)${t.automod_able ? '' : ', once the bot is a moderator here'}.`
}
</script>

<template>
  <section class="mtab">
    <h2 v-if="login" class="vx-eyebrow sub">This channel</h2>
    <div v-if="filters.length" class="table-scroll vx-panel">
      <table class="vx-table">
        <thead><tr><th>Pattern</th><th>Kind</th><th>Action</th><th>Category</th><th>On</th><th></th></tr></thead>
        <tbody>
          <tr v-for="f in filters" :key="f.id">
            <td class="vx-mono wrap">{{ f.pattern }}</td>
            <td>{{ f.kind }}</td>
            <td>{{ f.action }}<span v-if="f.replacement" class="vx-muted"> → {{ f.replacement }}</span></td>
            <td class="vx-muted">{{ f.category }}</td>
            <td>
              <VxSwitch
                :model-value="f.enabled"
                :disabled="!mayEdit || busy.has(`f:${f.id}`)"
                @update:model-value="(on: boolean) => act(`f:${f.id}`, () => send.edit(f.id, { enabled: on }), `${f.pattern} turned ${onOff(on)}`)"
              ><span class="sr-only">Filter {{ f.pattern }}</span></VxSwitch>
            </td>
            <td class="end">
              <template v-if="mayEdit">
                <VxButton size="sm" variant="ghost" @click="edit(f)">Edit</VxButton>
                <VxButton size="sm" variant="ghost" @click="deleting = f.id">Delete</VxButton>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <VxEmptyState v-else :title="login ? 'No entries for this channel' : 'The bot-wide list is empty'" :text="mayEdit ? 'Add a word or pattern below.' : undefined" />
    <form v-if="mayEdit" class="add vx-form-row vx-panel" @submit.prevent="add">
      <VxField label="Pattern">
        <template #default="{ id }"><VxInput :id="id" v-model="entry.pattern" mono placeholder="badword" /></template>
      </VxField>
      <VxField label="Kind"><template #default><VxSelect v-model="entry.kind" :options="KINDS" width="140px" /></template></VxField>
      <VxField label="Action"><template #default><VxSelect v-model="entry.action" :options="ACTIONS" width="140px" /></template></VxField>
      <VxField v-if="entry.action === 'replace'" label="Replace with">
        <template #default="{ id }"><VxInput :id="id" v-model="entry.replacement" /></template>
      </VxField>
      <VxField label="Category" help="Optional, to group entries.">
        <template #default="{ id }"><VxInput :id="id" v-model="entry.category" placeholder="slurs" /></template>
      </VxField>
      <VxButton type="submit" variant="primary" :loading="busy.has('filter-add')" :disabled="!entry.pattern.trim()">Add</VxButton>
    </form>

    <template v-if="login">
      <h2 class="vx-eyebrow sub">Try a message</h2>
      <form class="add vx-form-row vx-panel test" @submit.prevent="test">
        <VxField label="Message" help="What this channel's list and the bot-wide one do to it, and what automod would do. Nothing is sent." class="grow">
          <template #default="{ id }"><VxInput :id="id" v-model="sample" placeholder="a message from chat" /></template>
        </VxField>
        <VxButton type="submit" :loading="testing" :disabled="!sample.trim()">Try</VxButton>
        <div v-if="tested" class="result" role="status">
          <div>
            <VxChip :tone="tested.blocked ? 'bad' : tested.changed ? 'accent' : 'ok'">{{ tested.blocked ? 'blocked' : tested.changed ? 'changed' : 'passes' }}</VxChip>
            <span v-if="tested.patterns.length" class="vx-muted small"> caught by <template v-for="(p, i) in tested.patterns" :key="p"><template v-if="i">, </template><code>{{ p }}</code></template></span>
          </div>
          <div v-if="tested.changed && !tested.blocked">Sent as: <span class="vx-mono">{{ tested.text }}</span></div>
          <div v-if="automodSays(tested)" class="vx-muted">{{ automodSays(tested) }}</div>
        </div>
      </form>

      <h2 class="vx-eyebrow sub">Bot-wide</h2>
      <p class="vx-muted intro">
        The bot's own list applies in every channel and can't be changed from one. An <code>allow</code> entry
        above keeps a longer word that merely contains a banned one from being caught.
      </p>
      <div class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Pattern</th><th>Kind</th><th>Action</th><th>State</th></tr></thead>
          <tbody>
            <tr v-for="f in globalFilters ?? []" :key="f.id">
              <td class="vx-mono wrap">{{ f.pattern }}</td>
              <td>{{ f.kind }}</td>
              <td>{{ f.action }}<span v-if="f.replacement" class="vx-muted"> → {{ f.replacement }}</span></td>
              <td><VxChip :tone="f.enabled ? 'ok' : 'default'">{{ onOff(f.enabled) }}</VxChip></td>
            </tr>
            <tr v-if="!globalFilters?.length"><td colspan="4" class="vx-muted">The bot-wide list is empty.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <VxDialog :open="editing !== null" title="Edit filter entry" @update:open="(v: boolean) => { if (!v) editing = null }">
      <form id="filter-form" class="dialog-form" @submit.prevent="save">
        <VxField label="Pattern">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.pattern" mono /></template>
        </VxField>
        <VxField label="Kind"><template #default="{ id }"><VxSelect :id="id" v-model="draft.kind" :options="KINDS" width="100%" /></template></VxField>
        <VxField label="Action"><template #default="{ id }"><VxSelect :id="id" v-model="draft.action" :options="ACTIONS" width="100%" /></template></VxField>
        <VxField v-if="draft.action === 'replace'" label="Replace with">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.replacement" /></template>
        </VxField>
        <VxField label="Category">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.category" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          type="submit"
          form="filter-form"
          variant="primary"
          :loading="!!editing && busy.has(`f:${editing.id}`)"
          :disabled="!Object.keys(changes).length || !draft.pattern.trim()"
        >Save</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="deleting !== null" title="Delete this filter entry?" @update:open="(v: boolean) => { if (!v) deleting = null }">
      Messages it would have caught get through from now on. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('f-del')"
          @click="act('f-del', () => send.remove(deleting!), 'Filter entry deleted').then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.test .result { flex-basis: 100%; display: grid; gap: 4px; overflow-wrap: anywhere; }
</style>
