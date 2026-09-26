<script setup lang="ts">
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxField, VxInput, VxSkeleton, VxStatusDot, useToast } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import AdminShell from '@/components/AdminShell.vue'
import AuditTable from '@/components/AuditTable.vue'
import { can } from '@/lib/access'
import { admin, ago, health, type ApiKey } from '@/lib/admin'
import { ApiError } from '@/lib/api'
import { useLoad } from '@/lib/useLoad'

const toast = useToast()
const { data, error, reload } = useLoad(async () => {
  // A moderator gets neither health nor API keys from the bot, so those aren't asked for.
  const [ready, channels, keys, audit] = await Promise.all([
    can('health') ? health() : null,
    admin.channels(),
    can('keys') ? admin.keys() : null,
    admin.audit(8),
  ])
  return { ready, channels: channels.channels, keys: keys?.keys ?? [], audit: audit.entries }
})
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ── health ──
const components = computed(() =>
  Object.entries(data.value?.ready?.components ?? {}).map(([name, c]) => {
    const { status, ...detail } = c
    return { name, status, detail: Object.entries(detail).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ') }
  }),
)
const tone = (status: string) => (status === 'ok' ? 'ok' : status === 'disabled' ? 'default' : 'bad')

// ── channels ──
const joinLogin = ref('')
const joining = ref(false)
async function join() {
  const login = joinLogin.value.trim().replace(/^#/, '').toLowerCase()
  if (!login) return
  joining.value = true
  try {
    await admin.join(login)
    joinLogin.value = ''
    toast.show(`Joined #${login}`)
    await reload()
  } catch (e) {
    toast.show(`Couldn't join #${login}: ${message(e)}`, { kind: 'error', duration: 5000 })
  } finally {
    joining.value = false
  }
}

// ── API keys ──
const keyOpen = ref(false)
const keyName = ref('')
const keyWrite = ref(false)
const keyBusy = ref(false)
const keyError = ref<string | null>(null)
const secret = ref<{ name: string; value: string } | null>(null)
async function createKey() {
  if (!keyName.value.trim()) return
  keyBusy.value = true
  keyError.value = null
  try {
    const key = await admin.createKey(keyName.value.trim(), keyWrite.value ? ['read', 'write'] : ['read'])
    keyOpen.value = false
    secret.value = { name: key.name, value: key.secret }
    keyName.value = ''
    keyWrite.value = false
    await reload()
  } catch (e) {
    keyError.value = e instanceof ApiError && e.status === 400 ? e.message : message(e)
  } finally {
    keyBusy.value = false
  }
}
async function copySecret() {
  if (!secret.value) return
  try {
    await navigator.clipboard.writeText(secret.value.value)
    toast.show('Key copied')
  } catch {
    toast.show("Couldn't copy: select it and copy by hand", { kind: 'error' })
  }
}

const revoking = ref<ApiKey | null>(null)
const revokeBusy = ref(false)
async function revoke() {
  if (!revoking.value) return
  revokeBusy.value = true
  try {
    await admin.revokeKey(revoking.value.id)
    toast.show(`Revoked ${revoking.value.name}`)
    revoking.value = null
    await reload()
  } catch (e) {
    toast.show(`Couldn't revoke: ${message(e)}`, { kind: 'error', duration: 5000 })
  } finally {
    revokeBusy.value = false
  }
}
</script>

<template>
  <AdminShell title="Overview">
    <VxCallout v-if="error" tone="error" title="Couldn't load the admin overview">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="38px" /></div>
    <template v-else>
      <section v-if="can('health')">
        <h2 class="vx-eyebrow sec">Health</h2>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Component</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              <tr v-for="c in components" :key="c.name">
                <td class="vx-mono">{{ c.name }}</td>
                <td><VxChip :tone="tone(c.status)">{{ c.status }}</VxChip></td>
                <td class="vx-muted detail">{{ c.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="vx-eyebrow sec">Channels</h2>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Channel</th><th>Status</th><th>Sign</th><th>Tier</th><th>Logging</th><th>Backfill</th></tr></thead>
            <tbody>
              <tr v-for="c in data.channels" :key="c.channel_id">
                <td><RouterLink :to="`/admin/channels/${c.login}`" class="chan">#{{ c.login }}</RouterLink></td>
                <td><VxStatusDot :status="c.banned ? 'warn' : c.active && c.status === 'joined' ? 'ok' : 'off'" :label="c.status" /></td>
                <td class="vx-mono">{{ c.prefix }}</td>
                <td>{{ c.tier }}</td>
                <td>{{ c.log_enabled ? 'on' : 'off' }}</td>
                <td>{{ c.history_backfill ? 'on' : 'off' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <form v-if="can('channel.join')" class="row" @submit.prevent="join">
          <label class="sr-only" for="join-login">Channel to join</label>
          <VxInput id="join-login" v-model="joinLogin" placeholder="channel login" mono />
          <VxButton type="submit" :loading="joining" :disabled="!joinLogin.trim()">Join channel</VxButton>
        </form>
        <p class="vx-muted small">The same as <code>join</code> in chat: the bot joins and subscribes to the channel's events.</p>
      </section>

      <section v-if="can('keys')">
        <h2 class="vx-eyebrow sec">API keys</h2>
        <p class="vx-muted small">
          Keys for <code>/api/v1</code>. A <code>read</code> key sees configuration and logs; a <code>write</code> key
          also changes them. The key is shown once, when it's made, and only its hash is kept: if it's lost, revoke it
          and make another.
        </p>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Name</th><th>Scopes</th><th>Created</th><th>Last used</th><th></th></tr></thead>
            <tbody>
              <tr v-for="k in data.keys" :key="k.id">
                <td>{{ k.name }}</td>
                <td><VxChip v-for="s in k.scopes" :key="s" :tone="s === 'write' ? 'warn' : 'default'">{{ s }}</VxChip></td>
                <td class="vx-muted">{{ ago(k.created_at) }}</td>
                <td class="vx-muted">{{ ago(k.last_used_at) }}</td>
                <td class="end"><VxButton size="sm" variant="danger" @click="revoking = k">Revoke</VxButton></td>
              </tr>
              <tr v-if="!data.keys.length"><td colspan="5" class="vx-muted">No keys yet.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="row"><VxButton @click="keyOpen = true">New key</VxButton></div>
      </section>

      <section>
        <h2 class="vx-eyebrow sec">Recent changes</h2>
        <AuditTable :entries="data.audit" :channels="data.channels" />
        <div class="row"><RouterLink to="/admin/audit" class="vx-btn">All changes</RouterLink></div>
      </section>
    </template>

    <VxDialog v-model:open="keyOpen" title="New API key">
      <form id="new-key" class="dialog-form" @submit.prevent="createKey">
        <VxField label="What it's for" :error="keyError ?? undefined">
          <template #default="{ id }"><VxInput :id="id" v-model="keyName" placeholder="stream overlay" /></template>
        </VxField>
        <VxCheckbox v-model="keyWrite" label="Can also change settings (write)" />
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="new-key" variant="primary" :loading="keyBusy" :disabled="!keyName.trim()">Create key</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="!!secret" title="Copy the key now" :dismissable="false" width="520px">
      It's shown this once. Only its hash is kept.
      <pre class="vx-code secret">{{ secret?.value }}</pre>
      <template #actions>
        <VxButton @click="copySecret">Copy</VxButton>
        <VxButton variant="primary" @click="secret = null">Done</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="!!revoking" :title="`Revoke ${revoking?.name ?? ''}?`" @update:open="(v: boolean) => { if (!v) revoking = null }">
      Anything using this key stops working at once. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="revokeBusy" @click="revoke">Revoke</VxButton>
      </template>
    </VxDialog>
  </AdminShell>
</template>

<style scoped>
.loading { display: grid; gap: 6px; }
section { margin-bottom: 28px; }
.sec { margin: 0 0 8px; }
.small { font-size: 13px; margin: 0 0 8px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 6px; }
.row :deep(.vx-input-wrap) { flex: 1 1 14rem; max-width: 20rem; }
.table-scroll > table { min-width: 34rem; }
.detail { font-family: var(--vx-font-mono); font-size: 12px; overflow-wrap: anywhere; }
.chan { color: var(--vx-accent); }
.end { text-align: right; }
.vx-chip + .vx-chip { margin-left: 4px; }
.dialog-form { display: grid; gap: 12px; margin-top: 12px; }
.dialog-form :deep(input) { width: 100%; }
.secret { margin: 12px 0 0; white-space: pre-wrap; word-break: break-all; user-select: all; color: var(--vx-ink); }
</style>
