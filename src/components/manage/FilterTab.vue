<script setup lang="ts">
// A channel's word filter, and the bot-wide list it can't change. The same entries `filter` adds in chat.
import { VxButton, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSelect, VxSwitch } from '@vexoulz/ui'
import { reactive, ref } from 'vue'
import { can } from '@/lib/access'
import { admin, type FilterEntry } from '@/lib/admin'
import { onOff, useAct } from '@/lib/useAct'

const props = defineProps<{ login: string; filters: FilterEntry[]; globalFilters: FilterEntry[]; reload: () => Promise<void> }>()
const { busy, act } = useAct(props.reload)

const KINDS = ['word', 'wildcard', 'regex', 'allow'].map((v) => ({ value: v, label: v }))
const ACTIONS = ['mask', 'replace', 'tag', 'block'].map((v) => ({ value: v, label: v }))
const entry = reactive({ pattern: '', kind: 'word', action: 'mask', replacement: '' })
async function add() {
  const pattern = entry.pattern.trim()
  if (!pattern) return
  if (!(await act('filter-add', () => admin.addFilter(props.login, { ...entry, pattern }), `Added ${pattern}`))) return
  entry.pattern = ''
  entry.replacement = ''
}
const deleting = ref<number | null>(null)
</script>

<template>
  <section class="mtab">
    <h2 class="vx-eyebrow sub">This channel</h2>
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
                :disabled="!can('filter.edit', login) || busy.has(`f:${f.id}`)"
                @update:model-value="(on: boolean) => act(`f:${f.id}`, () => admin.setFilter(login, f.id, on), `${f.pattern} turned ${onOff(on)}`)"
              ><span class="sr-only">Filter {{ f.pattern }}</span></VxSwitch>
            </td>
            <td class="end"><VxButton v-if="can('filter.edit', login)" size="sm" variant="ghost" @click="deleting = f.id">Delete</VxButton></td>
          </tr>
        </tbody>
      </table>
    </div>
    <VxEmptyState v-else title="No entries for this channel" text="Add a word or pattern below." />
    <form v-if="can('filter.edit', login)" class="add vx-panel" @submit.prevent="add">
      <VxField label="Pattern">
        <template #default="{ id }"><VxInput :id="id" v-model="entry.pattern" mono placeholder="badword" /></template>
      </VxField>
      <VxField label="Kind"><template #default><VxSelect v-model="entry.kind" :options="KINDS" width="160px" /></template></VxField>
      <VxField label="Action"><template #default><VxSelect v-model="entry.action" :options="ACTIONS" width="160px" /></template></VxField>
      <VxField v-if="entry.action === 'replace'" label="Replace with">
        <template #default="{ id }"><VxInput :id="id" v-model="entry.replacement" /></template>
      </VxField>
      <VxButton type="submit" variant="primary" :loading="busy.has('filter-add')" :disabled="!entry.pattern.trim()">Add</VxButton>
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
          <tr v-for="f in globalFilters" :key="f.id">
            <td class="vx-mono wrap">{{ f.pattern }}</td>
            <td>{{ f.kind }}</td>
            <td>{{ f.action }}<span v-if="f.replacement" class="vx-muted"> → {{ f.replacement }}</span></td>
            <td><VxChip :tone="f.enabled ? 'ok' : 'default'">{{ onOff(f.enabled) }}</VxChip></td>
          </tr>
          <tr v-if="!globalFilters.length"><td colspan="4" class="vx-muted">The bot-wide list is empty.</td></tr>
        </tbody>
      </table>
    </div>

    <VxDialog :open="deleting !== null" title="Delete this filter entry?" @update:open="(v: boolean) => { if (!v) deleting = null }">
      Messages it would have caught get through from now on. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('f-del')"
          @click="act('f-del', () => admin.deleteFilter(login, deleting!), 'Filter entry deleted').then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
  </section>
</template>
