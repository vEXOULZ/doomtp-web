<script setup lang="ts">
// Variable storage limits (ADR-0019), the same as `admin quota|valuecap|listitems|names` in chat: the defaults for
// every owner, and overrides for one channel, publisher or chatter.
import { VxButton, VxCallout, VxField, VxInput, VxSelect, VxSkeleton } from '@vexoulz/ui'
import { computed, reactive, watch } from 'vue'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import { admin, OWNER_KINDS, type Limits, type LimitsPatch } from '@/lib/admin'
import { bytes, count } from '@/lib/format'
import { useAct } from '@/lib/useAct'

const FIELDS: { key: keyof Limits; label: string; size: boolean }[] = [
  { key: 'quota_bytes', label: 'Quota (bytes)', size: true },
  { key: 'value_cap_bytes', label: 'Largest value (bytes)', size: true },
  { key: 'list_items', label: 'Items a list', size: false },
  { key: 'names_per_space', label: 'Names a namespace', size: false },
]
const show = (f: (typeof FIELDS)[number], v: number | null | undefined) => (v === null || v === undefined ? 'default' : f.size ? bytes(v) : String(v))

const { data, error, reload } = useResource(() => admin.variableLimits())
const { busy, act } = useAct(reload)

// ── defaults: the form starts at what the bot has, and sends only what changed ──
const defaults = reactive<Record<keyof Limits, string | number>>({ quota_bytes: '', value_cap_bytes: '', list_items: '', names_per_space: '' })
watch(data, (d) => {
  if (d) for (const f of FIELDS) defaults[f.key] = String(d.defaults[f.key])
})
const defaultsPatch = computed<LimitsPatch>(() => {
  const out: LimitsPatch = {}
  for (const f of FIELDS) {
    const n = count(defaults[f.key])
    if (n !== null && n !== data.value?.defaults[f.key]) out[f.key] = n
  }
  return out
})
const saveDefaults = () => act('defaults', () => admin.setDefaultLimits(defaultsPatch.value), 'Default limits saved')

// ── one owner's override: blank keeps a field, `default` puts it back to the default ──
const KIND_OPTIONS = OWNER_KINDS.map((k) => ({ value: k, label: k }))
const owner = reactive({ kind: 'channel', user: '', quota_bytes: '', value_cap_bytes: '', list_items: '', names_per_space: '' })
const ownerPatch = computed<LimitsPatch | null>(() => {
  const out: LimitsPatch = {}
  for (const f of FIELDS) {
    const raw = owner[f.key].trim().toLowerCase()
    if (!raw) continue
    if (raw === 'default') out[f.key] = null
    else if (/^\d+$/.test(raw)) out[f.key] = Number(raw)
    else return null
  }
  return out
})
const ownerReady = computed(() => !!owner.user.trim() && !!ownerPatch.value && Object.keys(ownerPatch.value).length > 0)
async function saveOwner() {
  const who = owner.user.trim().replace(/^[@#]/, '')
  if (!ownerReady.value) return
  if (await act('owner', () => admin.setOwnerLimits(owner.kind, who, ownerPatch.value!), `Limits for ${owner.kind} @${who} saved`)) {
    for (const f of FIELDS) owner[f.key] = ''
  }
}
</script>

<template>
  <div class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load the storage limits">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 3" :key="i" h="38px" /></div>
    <template v-else>
      <form class="add vx-form-row vx-panel" @submit.prevent="saveDefaults">
        <VxField v-for="f in FIELDS" :key="f.key" :label="f.label" :help="f.size ? bytes(Number(defaults[f.key]) || 0) : undefined">
          <template #default="{ id }"><VxInput :id="id" v-model="defaults[f.key]" type="number" mono /></template>
        </VxField>
        <VxButton type="submit" variant="primary" :loading="busy.has('defaults')" :disabled="!Object.keys(defaultsPatch).length">Save defaults</VxButton>
      </form>

      <h3 class="vx-eyebrow sub">Overrides</h3>
      <div class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Owner</th><th v-for="f in FIELDS" :key="f.key">{{ f.label.replace(/ \(bytes\)$/, '') }}</th></tr></thead>
          <tbody>
            <tr v-for="o in data.overrides" :key="`${o.owner_kind}/${o.owner_id}`">
              <td class="nowrap"><span class="vx-muted">{{ o.owner_kind }}</span> <span class="vx-mono">{{ o.owner_id }}</span></td>
              <td v-for="f in FIELDS" :key="f.key" :class="{ 'vx-muted': o[f.key] === null || o[f.key] === undefined }">{{ show(f, o[f.key]) }}</td>
            </tr>
            <tr v-if="!data.overrides.length"><td :colspan="FIELDS.length + 1" class="vx-muted">Every owner has the defaults.</td></tr>
          </tbody>
        </table>
      </div>
      <form class="add vx-form-row vx-panel" @submit.prevent="saveOwner">
        <VxField label="Owner kind"><template #default><VxSelect v-model="owner.kind" :options="KIND_OPTIONS" width="140px" /></template></VxField>
        <VxField label="Twitch login">
          <template #default="{ id }"><VxInput :id="id" v-model="owner.user" mono placeholder="login" /></template>
        </VxField>
        <VxField v-for="f in FIELDS" :key="f.key" :label="f.label">
          <template #default="{ id }"><VxInput :id="id" v-model="owner[f.key]" mono placeholder="keep" /></template>
        </VxField>
        <VxButton type="submit" variant="primary" :loading="busy.has('owner')" :disabled="!ownerReady">Set override</VxButton>
      </form>
      <p class="vx-muted small">Leave a field blank to keep it; type <code>default</code> to put it back to the default.</p>
    </template>
  </div>
</template>
