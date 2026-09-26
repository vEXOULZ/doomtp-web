<script setup lang="ts">
// One channel: its status, the ban callout with rejoin, and tabs for settings, modules, published commands,
// triggers and timers, the word filter and ignored users. Every change goes through the same services as chat.
import {
  VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSelect, VxSkeleton, VxSwitch, VxTabs, useToast,
} from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AdminShell from '@/components/AdminShell.vue'
import ChannelSettings from '@/components/ChannelSettings.vue'
import ChatLine from '@/components/ChatLine.vue'
import { can, isMe } from '@/lib/access'
import { admin, ago, readIgnored, type Channel, type Ignored } from '@/lib/admin'
import { api } from '@/lib/api'
import { moduleRows, publishedRows } from '@/lib/modules'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const { data, error, status, reload } = useLoad(
  async () => {
    const [channel, modules, commands, packs, publications, triggers, filters, ignored, roles] = await Promise.all([
      admin.channel(props.login),
      admin.modules(props.login),
      admin.channelCommands(props.login),
      api.channelPacks(props.login),
      admin.publications(props.login),
      admin.triggers(props.login),
      admin.filters(props.login),
      admin.ignored(props.login),
      api.roles(),
    ])
    return {
      channel,
      modules: moduleRows(modules.modules, commands.commands, packs.packs, publications.publications),
      published: publishedRows(packs.packs, publications.publications),
      triggers: triggers.triggers,
      filters: filters.filters.filter((f) => !f.global),
      globalFilters: filters.filters.filter((f) => f.global),
      ignored: [
        ...ignored.ignored.map((e) => readIgnored(e, false)),
        ...ignored.ignored_everywhere.map((e) => readIgnored(e, true)),
      ],
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
/** Whether it worked: a failure is shown as a toast, and a form keeps what was typed. */
async function act(key: string, run: () => Promise<unknown>, done: string): Promise<boolean> {
  busy.add(key)
  try {
    await run()
    toast.show(done)
    await reload()
    return true
  } catch (e) {
    toast.show(e instanceof Error ? e.message : String(e), { kind: 'error', duration: 5000 })
    return false
  } finally {
    busy.delete(key)
  }
}
const onOff = (on: boolean) => (on ? 'on' : 'off')
const setModule = (name: string, on: boolean) =>
  act(`m:${name}`, () => admin.setModule(props.login, name, on), `${name} turned ${onOff(on)}`)

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
  if (!(await act('filter-add', () => admin.addFilter(props.login, { ...entry, pattern: entry.pattern.trim() }), `Added ${entry.pattern.trim()}`))) return
  entry.pattern = ''
  entry.replacement = ''
}
const deletingFilter = ref<number | null>(null)

// ── ignored users ──
const ignoring = reactive({ login: '', reason: '', everywhere: false })
async function ignore() {
  const who = ignoring.login.trim().replace(/^@/, '')
  if (!who) return
  const ok = await act(
    'ignore',
    () => admin.ignore(props.login, { login: who, everywhere: ignoring.everywhere, reason: ignoring.reason.trim() || undefined }),
    `Ignoring @${who}${ignoring.everywhere ? ' everywhere' : ''}`,
  )
  if (!ok) return
  ignoring.login = ''
  ignoring.reason = ''
}
const name = (u: Ignored) => (u.login ? `@${u.login}` : u.userId)
/** A moderator lifts ignores in this channel, an admin also bot-wide ones; anyone may lift their own self-ignore. */
const mayLift = (u: Ignored) => (u.self && isMe(u.userId)) || (can('ignored.edit') && (!u.everywhere || can('ignored.everywhere')))
const lifting = ref<Ignored | null>(null)
const lift = (u: Ignored) =>
  act('unignore', () => admin.unignore(props.login, u.userId, u.everywhere), `${name(u)} isn't ignored ${u.everywhere ? 'anywhere' : 'here'} any more`).then(
    (ok) => ok && (lifting.value = null),
  )
</script>

<template>
  <AdminShell :title="`#${login}`" eyebrow="Admin · channel">
    <template #actions>
      <RouterLink :to="`/channels/${login}`" class="vx-btn">Public page</RouterLink>
      <VxButton v-if="data && can('channel.part')" variant="danger" @click="partOpen = true">Leave channel</VxButton>
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
        <template v-if="can('channel.join')" #actions><VxButton size="sm" :loading="busy.has('rejoin')" @click="rejoin">Rejoin #{{ login }}</VxButton></template>
      </VxCallout>

      <VxTabs v-model="tab" :options="TABS" label="Channel sections" class="tabs" />

      <ChannelSettings v-if="tab === 'settings'" :channel="data.channel" :roles="data.roles" @saved="saved" />

      <section v-else-if="tab === 'modules'">
        <p class="vx-muted intro">
          Built-in modules and the packs published here. Turning one off is the same as
          <ChatLine :lines="`${sign}module disable <name>`" :sign="sign" /> in chat, and turns off every command it
          covers.
        </p>
        <div class="table-scroll vx-panel">
          <table class="vx-table modules">
            <thead><tr><th>Module</th><th>Commands</th><th class="end">On</th></tr></thead>
            <tbody>
              <tr v-for="m in data.modules" :key="m.name">
                <td class="mod">
                  <span class="vx-mono">{{ m.name }}</span>
                  <VxChip v-if="m.kind === 'pack'" :tone="m.scope === 'global' ? 'default' : 'accent'">{{ m.scope === 'global' ? 'pack · everywhere' : 'pack' }}</VxChip>
                  <VxChip v-else-if="m.kind === 'custom'">custom</VxChip>
                  <div v-if="m.summary || m.owners.length" class="vx-muted small">
                    {{ m.summary }}<template v-if="m.owners.length"> · by {{ m.owners.map((o) => `@${o}`).join(', ') }}</template>
                  </div>
                </td>
                <td class="cmds">
                  <ChatLine v-for="c in m.commands" :key="c" :lines="`${sign}${c}`" :sign="sign" />
                  <span v-if="!m.commands.length" class="vx-muted small">none</span>
                </td>
                <td class="end">
                  <span v-if="!m.toggleable" class="vx-muted small">always on</span>
                  <VxSwitch
                    v-else-if="m.enabled !== null"
                    :model-value="m.enabled"
                    :disabled="!can('modules.toggle') || busy.has(`m:${m.name}`)"
                    @update:model-value="(on: boolean) => setModule(m.name, on)"
                  ><span class="sr-only">Module {{ m.name }}</span></VxSwitch>
                  <span v-else class="unknown">
                    <span class="vx-muted small" title="The bot doesn't report whether this one is on yet">state not reported</span>
                    <VxButton size="sm" :disabled="!can('modules.toggle') || busy.has(`m:${m.name}`)" @click="setModule(m.name, true)">On</VxButton>
                    <VxButton size="sm" :disabled="!can('modules.toggle') || busy.has(`m:${m.name}`)" @click="setModule(m.name, false)">Off</VxButton>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="tab === 'commands'">
        <VxEmptyState v-if="!data.published.length" title="Nothing published here" text="Custom commands and packs published to this channel show up here." />
        <template v-else>
          <p class="vx-muted intro">Custom commands chat can run here. They turn on and off with their module, on the Modules tab.</p>
          <div class="table-scroll vx-panel">
            <table class="vx-table">
              <thead><tr><th>Command</th><th>Module</th><th>By</th><th>Version</th><th>State</th></tr></thead>
              <tbody>
                <tr v-for="p in data.published" :key="`${p.module}/${p.name}`">
                  <td>
                    <ChatLine :lines="`${sign}${p.name}`" :sign="sign" />
                    <div v-if="p.summary" class="vx-muted small">{{ p.summary }}</div>
                  </td>
                  <td><RouterLink :to="{ query: { ...route.query, tab: 'modules' } }" class="vx-mono">{{ p.module }}</RouterLink></td>
                  <td class="vx-muted">@{{ p.owner }}</td>
                  <td class="vx-mono vx-muted">v{{ p.version }}</td>
                  <td>
                    <VxChip :tone="p.status === 'active' ? 'ok' : 'default'">{{ p.status }}</VxChip>
                    <div v-if="p.status === 'orphaned'" class="vx-muted small">its owner deleted it</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
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
                    :disabled="!can('triggers.edit') || busy.has(`t:${t.id}`)"
                    @update:model-value="(on: boolean) => act(`t:${t.id}`, () => admin.setTrigger(login, t.id, on), `${t.type} turned ${onOff(on)}`)"
                  ><span class="sr-only">{{ t.type }} {{ t.id }}</span></VxSwitch>
                </td>
                <td class="end"><VxButton v-if="can('triggers.edit')" size="sm" variant="ghost" @click="deletingTrigger = t.id">Delete</VxButton></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="tab === 'filter'">
        <h2 class="vx-eyebrow sub">This channel</h2>
        <div v-if="data.filters.length" class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Pattern</th><th>Kind</th><th>Action</th><th>On</th><th></th></tr></thead>
            <tbody>
              <tr v-for="f in data.filters" :key="f.id">
                <td class="vx-mono wrap">{{ f.pattern }}</td>
                <td>{{ f.kind }}</td>
                <td>{{ f.action }}<span v-if="f.replacement" class="vx-muted"> → {{ f.replacement }}</span></td>
                <td>
                  <VxSwitch
                    :model-value="f.enabled"
                    :disabled="!can('filter.edit') || busy.has(`f:${f.id}`)"
                    @update:model-value="(on: boolean) => act(`f:${f.id}`, () => admin.setFilter(login, f.id, on), `${f.pattern} turned ${onOff(on)}`)"
                  ><span class="sr-only">Filter {{ f.pattern }}</span></VxSwitch>
                </td>
                <td class="end"><VxButton v-if="can('filter.edit')" size="sm" variant="ghost" @click="deletingFilter = f.id">Delete</VxButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <VxEmptyState v-else title="No entries for this channel" text="Add a word or pattern below." />
        <form v-if="can('filter.edit')" class="add vx-panel" @submit.prevent="addFilter">
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
              <tr v-for="f in data.globalFilters" :key="f.id">
                <td class="vx-mono wrap">{{ f.pattern }}</td>
                <td>{{ f.kind }}</td>
                <td>{{ f.action }}<span v-if="f.replacement" class="vx-muted"> → {{ f.replacement }}</span></td>
                <td><VxChip :tone="f.enabled ? 'ok' : 'default'">{{ onOff(f.enabled) }}</VxChip></td>
              </tr>
              <tr v-if="!data.globalFilters.length"><td colspan="4" class="vx-muted">The bot-wide list is empty.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else-if="tab === 'ignored'">
        <p class="vx-muted intro">
          Their messages are still logged but never run commands. Changed from chat with
          <ChatLine :lines="`${sign}ignore add <user>`" :sign="sign" />; chatters can opt out with
          <ChatLine :lines="`${sign}ignore me`" :sign="sign" /> and take it back with
          <ChatLine :lines="`${sign}unignore me`" :sign="sign" />.
        </p>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>User</th><th>Where</th><th>Ignored by</th><th>When</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              <tr v-for="u in data.ignored" :key="`${u.everywhere}${u.userId}`">
                <td>
                  <span v-if="u.login">@{{ u.login }}</span>
                  <span v-else class="vx-mono">{{ u.userId }}</span>
                </td>
                <td>{{ u.everywhere ? 'every channel' : 'this channel' }}</td>
                <td>
                  <VxChip v-if="u.self" tone="accent" title="They asked for it, so they can undo it themselves">themselves</VxChip>
                  <span v-else-if="u.addedByLogin">@{{ u.addedByLogin }}</span>
                  <span v-else-if="u.addedBy" class="vx-mono">{{ u.addedBy }}</span>
                  <span v-else class="vx-muted" title="Set with the admin password or an API key">admin</span>
                </td>
                <td class="vx-muted nowrap" :title="u.addedAt ? new Date(u.addedAt).toLocaleString() : undefined">{{ u.addedAt ? ago(u.addedAt) : '—' }}</td>
                <td class="vx-muted wrap">{{ u.reason ?? '' }}</td>
                <td class="end">
                  <VxButton v-if="u.self && isMe(u.userId)" size="sm" @click="lifting = u">Stop ignoring me</VxButton>
                  <VxButton v-else-if="mayLift(u)" size="sm" variant="ghost" @click="lifting = u">Unignore</VxButton>
                </td>
              </tr>
              <tr v-if="!data.ignored.length"><td colspan="6" class="vx-muted">Nobody is ignored here.</td></tr>
            </tbody>
          </table>
        </div>
        <form v-if="can('ignored.edit')" class="add vx-panel" @submit.prevent="ignore">
          <VxField label="User">
            <template #default="{ id }"><VxInput :id="id" v-model="ignoring.login" mono placeholder="twitch login" /></template>
          </VxField>
          <VxField label="Reason" class="grow">
            <template #default="{ id }"><VxInput :id="id" v-model="ignoring.reason" placeholder="optional" /></template>
          </VxField>
          <VxCheckbox v-if="can('ignored.everywhere')" v-model="ignoring.everywhere" label="In every channel" />
          <VxButton type="submit" variant="primary" :loading="busy.has('ignore')" :disabled="!ignoring.login.trim()">Ignore</VxButton>
        </form>
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
    <VxDialog
      :open="lifting !== null"
      :title="lifting && isMe(lifting.userId) ? 'Stop ignoring you?' : `Unignore ${lifting ? name(lifting) : ''}?`"
      @update:open="(v: boolean) => { if (!v) lifting = null }"
    >
      <template v-if="lifting && isMe(lifting.userId)">The bot answers your commands here again.</template>
      <template v-else>The bot answers their commands {{ lifting?.everywhere ? 'in every channel' : 'here' }} again.</template>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="primary" :loading="busy.has('unignore')" @click="lift(lifting!)">Unignore</VxButton>
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
.nowrap { white-space: nowrap; }
.sub { margin: 18px 0 8px; }
.sub:first-child { margin-top: 0; }
.mod .vx-chip { margin-left: 6px; }
.modules .cmds :deep(code) { display: inline-block; margin: 2px 10px 2px 0; white-space: nowrap; }
.grow { flex: 1 1 14rem; }
.grow :deep(.vx-input-wrap), .grow :deep(input) { width: 100%; }
.add :deep(.vx-checkbox) { align-self: center; }
.unknown { display: inline-flex; align-items: center; gap: 6px; }
.add { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; padding: 14px; margin-top: 12px; }
</style>
