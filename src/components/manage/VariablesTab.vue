<script setup lang="ts">
// A channel's own variables (`channel.*`) and how much of its storage they and the other namespaces use. Read
// only for now: writes belong to the runtime, where the access rules live.
import { VxButton, VxCallout, VxEmptyState, VxInput, VxProgress, VxSkeleton, timeAgo } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import { admin } from '@/lib/admin'
import { bytes, shown } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string }>()
const { data, error, reload } = useLoad(async () => {
  const [variables, storage] = await Promise.all([admin.variables(props.login), admin.storage(props.login)])
  return { variables: variables.variables, storage }
}, () => props.login)

const query = ref('')
const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const all = data.value?.variables ?? []
  return q ? all.filter((v) => v.name.toLowerCase().includes(q) || shown(v.value).toLowerCase().includes(q)) : all
})
const spaces = computed(() => Object.entries(data.value?.storage.namespaces ?? {}).sort((a, b) => b[1] - a[1]))
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load the variables">
      {{ error }}
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

      <h2 class="vx-eyebrow sub">Channel variables</h2>
      <VxEmptyState
        v-if="!data.variables.length"
        title="No channel variables yet"
        text="Custom commands set them with -> channel.name, for whoever the channel's settings allow."
      />
      <template v-else>
        <VxInput v-model="query" class="search" placeholder="Find a variable or value" aria-label="Find a variable" />
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Name</th><th>Value</th><th>Changed</th><th>By</th></tr></thead>
            <tbody>
              <tr v-for="v in rows" :key="v.name">
                <td class="vx-mono nowrap">channel.{{ v.name }}</td>
                <td class="vx-mono wrap value">{{ shown(v.value) }}</td>
                <td class="vx-muted nowrap" :title="v.updated_at ? new Date(v.updated_at).toLocaleString() : undefined">{{ timeAgo(v.updated_at) }}</td>
                <td class="vx-muted vx-mono">{{ v.updated_by ?? '' }}</td>
              </tr>
              <tr v-if="!rows.length"><td colspan="4" class="vx-muted">No variable matches “{{ query }}”.</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.storage { display: grid; gap: 8px; padding: 14px 16px; }
.meter { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
.limits { margin: 0; }
.value { max-width: 28rem; font-size: 12.5px; }
</style>
