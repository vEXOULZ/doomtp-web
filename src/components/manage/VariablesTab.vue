<script setup lang="ts">
// A channel's own variables (`channel.*`) and how much of its storage they and the other namespaces use. Whoever
// reaches the channel's "write channel variables" role sets and deletes them here, as `-> channel.name` does in a
// command.
import { VxButton, VxCallout, VxDialog, VxEmptyState, VxField, VxInput, VxProgress, VxSkeleton, timeAgo } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { useResource } from '@vexoulz/ui/utils'
import { bytes, errorText } from '@vexoulz/platform-web'
import { reachesRole } from '@/lib/access'
import { admin, type Variable } from '@/lib/admin'
import type { Role } from '@/lib/api'
import { shown, typedValue } from '@/lib/format'
import { useAct } from '@/lib/useAct'
import UserRef from '../UserRef.vue'

const props = defineProps<{
  login: string
  /** The channel's `channel_var_write_role`. */
  writeRole: string
  roles: Role[]
}>()
const { data, error, reload } = useResource(async () => {
  const [variables, storage] = await Promise.all([admin.variables(props.login), admin.storage(props.login)])
  return { variables: variables.variables, storage }
}, { source: () => props.login })
const { busy, act } = useAct(reload)
const mayWrite = computed(() => reachesRole(props.login, props.writeRole, props.roles))

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
        <h2 class="vx-eyebrow sub">Channel variables</h2>
        <VxButton v-if="mayWrite" size="sm" variant="primary" @click="openSet()">Set a variable</VxButton>
      </div>
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
  </section>
</template>

<style scoped>
.storage { display: grid; gap: 8px; padding: 14px 16px; }
.meter { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
.limits { margin: 0; }
.value { max-width: 28rem; font-size: 12.5px; }
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 18px; }
.head .sub { margin: 0; }
</style>
