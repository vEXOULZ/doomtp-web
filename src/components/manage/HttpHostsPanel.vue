<script setup lang="ts">
// The hosts `http get` may fetch (ADR-0020), the same as `admin http` in chat: allow and remove them, attach a
// secret the bot adds to each request (its value goes in and never comes back), and the rate limits.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxField, VxInput, VxRadioGroup, VxSkeleton, timeAgo } from '@vexoulz/ui'
import { computed, reactive, ref, watch } from 'vue'
import { admin, type HttpHost, type HttpLimits } from '@/lib/admin'
import { count } from '@/lib/format'
import { useAct } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const { data, error, reload } = useLoad(() => admin.httpHosts())
const { busy, act } = useAct(reload)

// ── allow a host ──
const adding = reactive({ pattern: '', plainHttp: false })
async function allow() {
  const pattern = adding.pattern.trim().toLowerCase()
  if (!pattern) return
  if (await act('allow', () => admin.allowHost(pattern, adding.plainHttp), `${pattern} allowed`)) {
    adding.pattern = ''
    adding.plainHttp = false
  }
}
const removing = ref<HttpHost | null>(null)
const remove = (h: HttpHost) => act('deny', () => admin.denyHost(h.pattern), `${h.pattern} removed`).then((ok) => ok && (removing.value = null))

// ── secrets: write only ──
const SECRET_KINDS = [
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query parameter' },
]
const secretFor = ref<HttpHost | null>(null)
const secret = reactive({ kind: 'header' as 'header' | 'query', name: '', value: '' })
function editSecret(h: HttpHost) {
  Object.assign(secret, { kind: h.secret?.kind ?? 'header', name: h.secret?.name ?? '', value: '' })
  secretFor.value = h
}
async function saveSecret() {
  const h = secretFor.value
  if (!h || !secret.name.trim() || !secret.value) return
  const body = { kind: secret.kind, name: secret.name.trim(), value: secret.value }
  if (await act('secret', () => admin.setHostSecret(h.pattern, body), `Secret set for ${h.pattern}`)) {
    secret.value = ''
    secretFor.value = null
  }
}
const clearSecret = (h: HttpHost) => act(`clear:${h.pattern}`, () => admin.clearHostSecret(h.pattern), `Secret removed from ${h.pattern}`)

// ── rate limits ──
const limits = reactive<Record<keyof HttpLimits, string | number>>({ channel_per_minute: '', host_per_minute: '' })
watch(data, (d) => {
  if (d) Object.assign(limits, { channel_per_minute: String(d.limits.channel_per_minute), host_per_minute: String(d.limits.host_per_minute) })
})
const limitsPatch = computed<Partial<HttpLimits>>(() => {
  const out: Partial<HttpLimits> = {}
  for (const k of ['channel_per_minute', 'host_per_minute'] as const) {
    const n = count(limits[k])
    if (n !== null && n !== data.value?.limits[k]) out[k] = n
  }
  return out
})
const saveLimits = () => act('limits', () => admin.setHttpLimits(limitsPatch.value), 'HTTP rate limits saved')
</script>

<template>
  <div class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load the HTTP hosts">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 3" :key="i" h="38px" /></div>
    <template v-else>
      <div class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Host</th><th>Scheme</th><th>Secret</th><th>Added</th><th></th></tr></thead>
          <tbody>
            <tr v-for="h in data.hosts" :key="h.pattern">
              <td class="vx-mono wrap">{{ h.pattern }}</td>
              <td><VxChip :tone="h.plain_http ? 'warn' : 'default'">{{ h.plain_http ? 'http too' : 'https' }}</VxChip></td>
              <td>
                <span v-if="h.secret" class="vx-mono">{{ h.secret.kind }} {{ h.secret.name }}</span>
                <span v-else class="vx-muted">none</span>
              </td>
              <td class="vx-muted nowrap" :title="h.added_at ? new Date(h.added_at).toLocaleString() : undefined">
                {{ timeAgo(h.added_at) }}<template v-if="h.added_by"> · {{ h.added_by }}</template>
              </td>
              <td class="end">
                <VxButton size="sm" variant="ghost" @click="editSecret(h)">{{ h.secret ? 'Replace secret' : 'Add secret' }}</VxButton>
                <VxButton v-if="h.secret" size="sm" variant="ghost" :loading="busy.has(`clear:${h.pattern}`)" @click="clearSecret(h)">Remove secret</VxButton>
                <VxButton size="sm" variant="danger" @click="removing = h">Remove</VxButton>
              </td>
            </tr>
            <tr v-if="!data.hosts.length"><td colspan="5" class="vx-muted">No hosts yet: <code>http get</code> can't fetch anything.</td></tr>
          </tbody>
        </table>
      </div>
      <form class="add vx-panel" @submit.prevent="allow">
        <VxField label="Host" class="grow" help="A name like api.example.com, or *.example.com for its subdomains.">
          <template #default="{ id }"><VxInput :id="id" v-model="adding.pattern" mono placeholder="api.example.com" /></template>
        </VxField>
        <VxCheckbox v-model="adding.plainHttp" label="Allow plain http" />
        <VxButton type="submit" variant="primary" :loading="busy.has('allow')" :disabled="!adding.pattern.trim()">Allow</VxButton>
      </form>

      <h3 class="vx-eyebrow sub">Rate limits</h3>
      <form class="add vx-panel" @submit.prevent="saveLimits">
        <VxField label="Requests a minute, per channel">
          <template #default="{ id }"><VxInput :id="id" v-model="limits.channel_per_minute" type="number" mono /></template>
        </VxField>
        <VxField label="Requests a minute, per host">
          <template #default="{ id }"><VxInput :id="id" v-model="limits.host_per_minute" type="number" mono /></template>
        </VxField>
        <VxButton type="submit" variant="primary" :loading="busy.has('limits')" :disabled="!Object.keys(limitsPatch).length">Save limits</VxButton>
      </form>
    </template>

    <VxDialog :open="secretFor !== null" :title="`Secret for ${secretFor?.pattern ?? ''}`" @update:open="(v: boolean) => { if (!v) secretFor = null }">
      <form id="host-secret" class="dialog-form" @submit.prevent="saveSecret">
        <p class="vx-muted small">
          The bot adds it to every request to this host. Once saved, the value can't be read back, only replaced.
        </p>
        <VxRadioGroup v-model="secret.kind" :options="SECRET_KINDS" label="Sent as" inline />
        <VxField :label="secret.kind === 'header' ? 'Header name' : 'Parameter name'">
          <template #default="{ id }"><VxInput :id="id" v-model="secret.name" mono :placeholder="secret.kind === 'header' ? 'Authorization' : 'api_key'" /></template>
        </VxField>
        <VxField label="Value">
          <template #default="{ id }"><VxInput :id="id" v-model="secret.value" type="password" mono autocomplete="off" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="host-secret" variant="primary" :loading="busy.has('secret')" :disabled="!secret.name.trim() || !secret.value">Save secret</VxButton>
      </template>
    </VxDialog>
    <VxDialog :open="removing !== null" :title="`Remove ${removing?.pattern ?? ''}?`" @update:open="(v: boolean) => { if (!v) removing = null }">
      Commands that fetch from it fail from now on, and its secret is dropped.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="busy.has('deny')" @click="remove(removing!)">Remove</VxButton>
      </template>
    </VxDialog>
  </div>
</template>
