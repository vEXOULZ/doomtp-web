<script setup lang="ts">
// One channel: its status, the ban callout with rejoin, and tabs for settings, modules, published commands,
// triggers and timers, the word filter and ignored users. Every change goes through the same services as chat.
import {
  VxButton, VxCallout, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSelect, VxSkeleton, VxSwitch, VxTabs, useToast,
} from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import ChannelSettings from '@/components/ChannelSettings.vue'
import ChatLine from '@/components/ChatLine.vue'
import { admin, type Channel } from '@/lib/admin'
import { api } from '@/lib/api'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const { data, error, status, reload } = useLoad(
  async () => {
    const [channel, modules, publications, triggers, filters, ignored, roles] = await Promise.all([
      admin.channel(props.login),
      admin.modules(props.login),
      admin.publications(props.login),
      admin.triggers(props.login),
      admin.filters(props.login),
      admin.ignored(props.login),
      api.roles(),
    ])
    return {
      channel,
      modules: modules.modules,
      publications: publications.publications,
      triggers: triggers.triggers,
      filters: filters.filters,
      ignored,
      // A channel setting can require any built-in role up to the broadcaster.
      roles: roles.roles.filter((r) => r.rank <= 100).map((r) => r.name),
    }
  },
  () => props.login,
)
const sign = computed(() => data.value?.channel.prefix ?? '!')

// ── tabs, kept in the URL so a tab can be linked ──
const TABS = [
  { value: 'settings', label: 'Settings' },
  { value: 'modules', label: 'Modules' },
  { value: 'commands', label: 'Published' },
  { value: 'triggers', label: 'Triggers & timers' },
  { value: 'filter', label: 'Word filter' },
  { value: 'ignored', label: 'Ignored' },
]
const tab = computed({
  get: () => (TABS.some((t) => t.value === route.query.tab) ? String(route.query.tab) : 'settings'),
  set: (value: string) => router.replace({ query: { ...route.query, tab: value === 'settings' ? undefined : value } }),
})

// ── one helper for every change: run it, say so, refresh ──
const busy = reactive(new Set<string>())
async function act(key: string, run: () => Promise<unknown>, done: string) {
  busy.add(key)
  try {
    await run()
    toast.show(done)
    await reload()
  } catch (e) {
    toast.show(e instanceof Error ? e.message : String(e), { kind: 'error', duration: 5000 })
  } finally {
    busy.delete(key)
  }
}
const onOff = (on: boolean) => (on ? 'on' : 'off')

const statusChips = computed(() => {
  const c = data.value?.channel
  if (!c) return []
  return [
    { k: 'status', v: c.status, tone: c.active && c.status === 'joined' ? 'ok' : 'bad' },
    { k: 'tier', v: c.tier, tone: 'accent' },
    { k: 'logging', v: onOff(c.log_enabled), tone: c.log_enabled ? 'ok' : 'default' },
    { k: 'backfill', v: onOff(c.history_backfill), tone: 'default' },
    { k: 'automod', v: c.automod.action === 'timeout' ? `timeout ${c.automod.timeout_s}s` : c.automod.action, tone: c.automod.action === 'off' ? 'default' : 'ok' },
  ] as { k: string; v: string; tone: 'ok' | 'bad' | 'accent' | 'default' }[]
})

function saved(channel: Channel) {
  if (data.value) data.value.channel = channel
}

// ── rejoin and part ──
const rejoin = () => act('rejoin', () => admin.join(props.login, true), `Rejoined #${props.login}`)
const partOpen = ref(false)
async function part() {
  busy.add('part')
  try {
    await admin.part(props.login)
    toast.show(`Left #${props.login}`)
    partOpen.value = false
    router.push('/admin')
  } catch (e) {
    toast.show(e instanceof Error ? e.message : String(e), { kind: 'error', duration: 5000 })
  } finally {
    busy.delete('part')
  }
}

// ── triggers ──
function matches(t: { type: string; match: Record<string, unknown>; schedule: Record<string, unknown> }) {
  if (typeof t.match.regex === 'string') return t.match.regex
  if (typeof t.schedule.every_s === 'number') return `every ${t.schedule.every_s}s`
  const rest = { ...t.match, ...t.schedule }
  return Object.keys(rest).length ? JSON.stringify(rest) : ''
}
const deletingTrigger = ref<number | null>(null)

// ── word filter ──
const KINDS = ['word', 'wildcard', 'regex', 'allow'].map((v) => ({ value: v, label: v }))
const ACTIONS = ['mask', 'replace', 'tag', 'block'].map((v) => ({ value: v, label: v }))
const entry = reactive({ pattern: '', kind: 'word', action: 'mask', replacement: '' })
async function addFilter() {
  if (!entry.pattern.trim()) return
  await act('filter-add', () => admin.addFilter(props.login, { ...entry, pattern: entry.pattern.trim() }), `Added ${entry.pattern.trim()}`)
  entry.pattern = ''
  entry.replacement = ''
}
const deletingFilter = ref<number | null>(null)
</script>

<template>
  <AdminShell :title="`#${login}`" eyebrow="Admin · channel">
    <template #actions>
      <RouterLink :to="`/channels/${login}`" class="vx-btn">Public page</RouterLink>
      <VxButton v-if="data" variant="danger" @click="partOpen = true">Leave channel</VxButton>
    </template>

    <VxCallout v-if="error" tone="error" :title="status === 404 ? `The bot doesn't know #${login}` : `Couldn't load #${login}`">
      {{ error }}
      <template #actions>
        <RouterLink v-if="status === 404" to="/admin" class="vx-btn is-sm">All channels</RouterLink>
        <VxButton v-else size="sm" @click="reload">Try again</VxButton>
      </template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="38px" /></div>
    <template v-else>
      <div class="chips">
        <VxChip k="sign"><ChatLine :lines="sign" :sign="sign" /></VxChip>
        <VxChip v-for="c in statusChips" :key="c.k" :k="c.k" :tone="c.tone">{{ c.v }}</VxChip>
      </div>

      <VxCallout v-if="data.channel.banned" tone="error" title="The bot left because it was banned here">
        Twitch refused one of its messages with 403. It stays out until someone brings it back on purpose. Unban it
        first: if it's still banned, the next message it sends makes it leave again.
        <template #actions><VxButton size="sm" :loading="busy.has('rejoin')" @click="rejoin">Rejoin #{{ login }}</VxButton></template>
      </VxCallout>

      <VxTabs v-model="tab" :options="TABS" label="Channel sections" class="tabs" />

      <ChannelSettings v-if="tab === 'settings'" :channel="data.channel" :roles="data.roles" @saved="saved" />

      <section v-else-if="tab === 'modules'" class="narrow">
        <p class="vx-muted intro">Turning a module off here is the same as <ChatLine :lines="`${sign}module disable <name>`" :sign="sign" /> in chat.</p>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <tbody>
              <tr v-for="m in data.modules" :key="m.module">
                <td class="vx-mono">{{ m.module }}</td>
                <td class="end">
                  <span v-if="!m.toggleable" class="vx-muted small">always on</span>
                  <VxSwitch
                    v-else
                    :model-value="m.enabled"
                    :disabled="busy.has(`m:${m.module}`)"
                    @update:model-value="(on: boolean) => act(`m:${m.module}`, () => admin.setModule(login, m.module, on), `${m.module} turned ${onOff(on)}`)"
                  ><span class="sr-only">Module {{ m.module }}</span></VxSwitch>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="tab === 'commands'">
        <VxEmptyState v-if="!data.publications.length" title="Nothing published here" text="Custom commands published to this channel show up here." />
        <div v-else class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Command</th><th>By</th><th>Version</th><th>State</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in data.publications" :key="p.id">
                <td><ChatLine :lines="`${sign}${p.published_as}`" :sign="sign" /></td>
                <td class="vx-muted">@{{ p.owner }}</td>
                <td class="vx-mono vx-muted">v{{ p.version }}</td>
                <td><VxChip :tone="p.status === 'active' ? 'ok' : 'default'">{{ p.status }}</VxChip></td>
                <td class="end">
                  <span v-if="p.status === 'orphaned'" class="vx-muted small">its owner deleted it</span>
                  <VxButton
                    v-else
                    size="sm"
                    :variant="p.status === 'active' ? 'danger' : 'default'"
                    :loading="busy.has(`p:${p.published_as}`)"
                    @click="act(`p:${p.published_as}`, () => admin.setPublication(login, p.published_as, p.status !== 'active'), `${p.published_as} ${p.status === 'active' ? 'disabled' : 'enabled'}`)"
                  >{{ p.status === 'active' ? 'Disable' : 'Enable' }}</VxButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="tab === 'triggers'">
        <VxEmptyState v-if="!data.triggers.length" title="No triggers or timers">
          <template #default>
            Add one in chat with <ChatLine :lines="`${sign}trigger listen <regex> => <expression>`" :sign="sign" /> or
            <ChatLine :lines="`${sign}timer add 15m <expression>`" :sign="sign" />.
          </template>
        </VxEmptyState>
        <div v-else class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Type</th><th>Matches</th><th>Expression</th><th>Runs as</th><th>On</th><th></th></tr></thead>
            <tbody>
              <tr v-for="t in data.triggers" :key="t.id">
                <td><VxChip :tone="t.type === 'timer' ? 'default' : 'accent'">{{ t.type }}</VxChip></td>
                <td class="vx-mono vx-muted wrap">{{ matches(t) }}</td>
                <td class="wrap"><ChatLine :lines="t.expr" :sign="sign" context="body" /></td>
                <td class="vx-muted">rank {{ t.run_as_rank }}</td>
                <td>
                  <VxSwitch
                    :model-value="t.enabled"
                    :disabled="busy.has(`t:${t.id}`)"
                    @update:model-value="(on: boolean) => act(`t:${t.id}`, () => admin.setTrigger(login, t.id, on), `${t.type} turned ${onOff(on)}`)"
                  ><span class="sr-only">{{ t.type }} {{ t.id }}</span></VxSwitch>
                </td>
                <td class="end"><VxButton size="sm" variant="ghost" label="Delete" @click="deletingTrigger = t.id">Delete</VxButton></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="tab === 'filter'">
        <div v-if="data.filters.length" class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Pattern</th><th>Kind</th><th>Action</th><th>Scope</th><th>On</th><th></th></tr></thead>
            <tbody>
              <tr v-for="f in data.filters" :key="f.id">
                <td class="vx-mono wrap">{{ f.pattern }}</td>
                <td>{{ f.kind }}</td>
                <td>{{ f.action }}<span v-if="f.replacement" class="vx-muted"> → {{ f.replacement }}</span></td>
                <td>{{ f.global ? 'bot-wide' : 'this channel' }}</td>
                <td>
                  <span v-if="f.global" class="vx-muted small">{{ onOff(f.enabled) }}</span>
                  <VxSwitch
                    v-else
                    :model-value="f.enabled"
                    :disabled="busy.has(`f:${f.id}`)"
                    @update:model-value="(on: boolean) => act(`f:${f.id}`, () => admin.setFilter(login, f.id, on), `${f.pattern} turned ${onOff(on)}`)"
                  ><span class="sr-only">Filter {{ f.pattern }}</span></VxSwitch>
                </td>
                <td class="end"><VxButton v-if="!f.global" size="sm" variant="ghost" @click="deletingFilter = f.id">Delete</VxButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <VxEmptyState v-else title="No filter entries" text="Add a word or pattern below." />
        <form class="add vx-panel" @submit.prevent="addFilter">
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
      </section>

      <section v-else-if="tab === 'ignored'" class="narrow">
        <p class="vx-muted intro">
          Their messages are still logged but never run commands. Changed from chat with
          <ChatLine :lines="`${sign}ignore <user>`" :sign="sign" />.
        </p>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>User id</th><th>Where</th></tr></thead>
            <tbody>
              <tr v-for="id in data.ignored.ignored" :key="`c${id}`"><td class="vx-mono">{{ id }}</td><td>this channel</td></tr>
              <tr v-for="id in data.ignored.ignored_everywhere" :key="`g${id}`"><td class="vx-mono">{{ id }}</td><td>every channel</td></tr>
              <tr v-if="!data.ignored.ignored.length && !data.ignored.ignored_everywhere.length">
                <td colspan="2" class="vx-muted">Nobody is ignored here.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <VxDialog v-model:open="partOpen" :title="`Leave #${login}?`">
      The bot parts the channel and stops answering there. Its settings, commands and logs stay, and joining again
      brings everything back.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="busy.has('part')" @click="part">Leave</VxButton>
      </template>
    </VxDialog>
    <VxDialog :open="deletingTrigger !== null" title="Delete this trigger?" @update:open="(v: boolean) => { if (!v) deletingTrigger = null }">
      It stops firing at once. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('t-del')"
          @click="act('t-del', () => admin.deleteTrigger(login, deletingTrigger!), 'Trigger deleted').then(() => (deletingTrigger = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
    <VxDialog :open="deletingFilter !== null" title="Delete this filter entry?" @update:open="(v: boolean) => { if (!v) deletingFilter = null }">
      Messages it would have caught get through from now on. This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('f-del')"
          @click="act('f-del', () => admin.deleteFilter(login, deletingFilter!), 'Filter entry deleted').then(() => (deletingFilter = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
  </AdminShell>
</template>

<style scoped>
.loading { display: grid; gap: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.chips :deep(code.dtb) { font-size: inherit; }
.tabs { margin: 16px 0 14px; }
.intro { margin: 0 0 10px; }
.small { font-size: 12px; }
.end { text-align: right; white-space: nowrap; }
.wrap { overflow-wrap: anywhere; }
.table-scroll > table { min-width: 30rem; }
.narrow { max-width: 36rem; }
.narrow .table-scroll > table { min-width: 0; }
.add { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 14px; margin-top: 12px; }
</style>
