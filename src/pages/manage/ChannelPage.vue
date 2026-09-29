<script setup lang="ts">
// One channel: its status, tier and capabilities, the ban callout with rejoin, and a tab per area (components/manage).
// Every change goes through the same services as chat. The tabs that page through their own data (variables, runs,
// the chat log, the audit) load it themselves; the rest share one load here and ask for it again after a change.
import { VxButton, VxCallout, VxChip, VxDialog, VxSkeleton, VxTabs, useToast } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ManageShell from '@/components/ManageShell.vue'
import ChannelSettings from '@/components/ChannelSettings.vue'
import ChatLine from '@/components/ChatLine.vue'
import AuditBrowser from '@/components/manage/AuditBrowser.vue'
import BackfillPanel from '@/components/manage/BackfillPanel.vue'
import ChatLogTab from '@/components/manage/ChatLogTab.vue'
import FilterTab from '@/components/manage/FilterTab.vue'
import IgnoredTab from '@/components/manage/IgnoredTab.vue'
import ModulesTab from '@/components/manage/ModulesTab.vue'
import PublishedTab from '@/components/manage/PublishedTab.vue'
import RepliesTab from '@/components/manage/RepliesTab.vue'
import RolesTab from '@/components/manage/RolesTab.vue'
import RulesTab from '@/components/manage/RulesTab.vue'
import RunsTab from '@/components/manage/RunsTab.vue'
import TriggersTab from '@/components/manage/TriggersTab.vue'
import VariablesTab from '@/components/manage/VariablesTab.vue'
import '@/components/manage/tabs.css'
import { can, manages } from '@/lib/access'
import { admin, readIgnored, type Channel } from '@/lib/admin'
import { api, errorMessage } from '@/lib/api'
import { commandRows, moduleRows, publishedRows } from '@/lib/modules'
import { CONNECT_URL, refresh, session } from '@/lib/session'
import { useAct, onOff } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string }>()
const route = useRoute()
const router = useRouter()
const toast = useToast()

// A moderator's session lists their channels: another channel's page would only be refused, so it isn't loaded.
const notMine = computed(() => !manages(props.login))

const { data, error, status, reload } = useLoad(
  async () => {
    if (notMine.value) return null
    const [channel, modules, commands, packs, publications, triggers, filters, ignored, roles, builtins] = await Promise.all([
      admin.channel(props.login),
      admin.modules(props.login),
      admin.channelCommands(props.login),
      api.channelPacks(props.login),
      admin.publications(props.login),
      admin.triggers(props.login),
      admin.filters(props.login),
      admin.ignored(props.login),
      api.roles(),
      api.commands(),
    ])
    return {
      channel,
      modules: moduleRows(modules.modules, commands.commands, packs.packs, publications.publications),
      published: publishedRows(packs.packs, publications.publications),
      packs: packs.packs,
      commands: commandRows(commands.commands, builtins.commands),
      triggers: triggers.triggers,
      filters: filters.filters.filter((f) => !f.global),
      globalFilters: filters.filters.filter((f) => f.global),
      ignored: [
        ...ignored.ignored.map((e) => readIgnored(e, false)),
        ...ignored.ignored_everywhere.map((e) => readIgnored(e, true)),
      ],
      allRoles: roles.roles,
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
  { value: 'rules', label: 'Commands' },
  { value: 'commands', label: 'Published' },
  { value: 'triggers', label: 'Triggers & timers' },
  { value: 'replies', label: 'Replies' },
  { value: 'filter', label: 'Word filter' },
  { value: 'roles', label: 'Roles' },
  { value: 'variables', label: 'Variables' },
  { value: 'runs', label: 'Runs' },
  { value: 'log', label: 'Chat log' },
  { value: 'audit', label: 'Audit' },
  { value: 'ignored', label: 'Ignored' },
]
const tab = computed({
  get: () => (TABS.some((t) => t.value === route.query.tab) ? String(route.query.tab) : 'settings'),
  set: (value: string) => router.replace({ query: { ...route.query, tab: value === 'settings' ? undefined : value } }),
})

const statusChips = computed(() => {
  const c = data.value?.channel
  if (!c) return []
  return [
    { k: 'status', v: c.status, tone: c.active && c.status === 'joined' ? 'ok' : 'bad' },
    { k: 'tier', v: c.tier, tone: c.tier === 'full' ? 'ok' : 'accent' },
    { k: 'logging', v: onOff(c.log_enabled), tone: c.log_enabled ? 'ok' : 'default' },
    ...(c.public_log === undefined ? [] : [{ k: 'public log', v: onOff(c.public_log && c.log_enabled), tone: 'default' }]),
    { k: 'backfill', v: onOff(c.history_backfill), tone: 'default' },
    { k: 'automod', v: c.automod.action === 'timeout' ? `timeout ${c.automod.timeout_s}s` : c.automod.action, tone: c.automod.action === 'off' ? 'default' : 'ok' },
  ] as { k: string; v: string; tone: 'ok' | 'bad' | 'accent' | 'default' }[]
})
/** Only the broadcaster can grant the bot more: the upgrade is their own Twitch consent. */
const mayUpgrade = computed(() => data.value?.channel.tier !== 'full' && session.channelRoles?.[props.login] === 'broadcaster')

function saved(channel: Channel) {
  if (data.value) data.value = { ...data.value, channel }
}

// ── rejoin and part ──
const { busy, act } = useAct(reload)
const probe = () => act('probe', () => admin.probe(props.login), `Asked Twitch what the bot may do in #${props.login}`)
const rejoin = () => act('rejoin', () => admin.join(props.login, true), `Rejoined #${props.login}`)
const partOpen = ref(false)
async function part() {
  busy.add('part')
  try {
    await admin.part(props.login)
    toast.show(`Left #${props.login}`)
    partOpen.value = false
    await refresh() // a broadcaster who sent the bot away no longer manages the channel
    router.push('/manage')
  } catch (e) {
    toast.show(errorMessage(e), { kind: 'error', duration: 5000 })
  } finally {
    busy.delete('part')
  }
}
</script>

<template>
  <ManageShell :title="`#${login}`" eyebrow="Manage · channel">
    <template #actions>
      <RouterLink :to="`/channels/${login}`" class="vx-btn">Public page</RouterLink>
      <VxButton v-if="data && can('channel.part', login)" variant="danger" @click="partOpen = true">Leave channel</VxButton>
    </template>

    <VxCallout v-if="notMine || status === 403" tone="warn" :title="`#${login} isn't one of your channels`">
      You can manage the channels you own or moderate on Twitch. The bot checks that every few minutes, so if you became
      a moderator there just now, reload this page in a little while.
      <template #actions><RouterLink to="/manage" class="vx-btn is-sm">Your channels</RouterLink></template>
    </VxCallout>
    <VxCallout v-else-if="error" tone="error" :title="status === 404 ? `The bot doesn't know #${login}` : `Couldn't load #${login}`">
      {{ error }}
      <template #actions>
        <RouterLink v-if="status === 404" to="/manage" class="vx-btn is-sm">All channels</RouterLink>
        <VxButton v-else size="sm" @click="reload">Try again</VxButton>
      </template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="38px" /></div>
    <template v-else>
      <div class="chips">
        <VxChip k="sign"><ChatLine :lines="sign" :sign="sign" /></VxChip>
        <VxChip v-for="c in statusChips" :key="c.k" :k="c.k" :tone="c.tone">{{ c.v }}</VxChip>
      </div>
      <div class="chips caps" :aria-label="`What the bot may do in #${login}`">
        <span class="vx-muted small">Twitch permissions:</span>
        <VxChip v-for="cap in data.channel.capabilities" :key="cap">{{ cap }}</VxChip>
        <span v-if="!data.channel.capabilities.length" class="vx-muted small">none beyond chat</span>
        <VxButton v-if="can('channel.probe')" size="sm" variant="ghost" :loading="busy.has('probe')" @click="probe">Check again</VxButton>
      </div>

      <VxCallout v-if="mayUpgrade" tone="info" :title="`#${login} is on the ${data.channel.tier} tier`">
        Some commands and triggers need more of your channel (followers, redemptions, bits). Reconnect to grant the
        bot the full tier; you see on Twitch exactly what it asks for.
        <template #actions><VxButton :href="CONNECT_URL" size="sm" variant="primary">Upgrade to the full tier</VxButton></template>
      </VxCallout>

      <VxCallout v-if="data.channel.banned" tone="error" title="The bot left because it was banned here">
        Twitch refused one of its messages with 403. It stays out until someone brings it back on purpose. Unban it
        first: if it's still banned, the next message it sends makes it leave again.
        <template v-if="can('channel.join')" #actions><VxButton size="sm" :loading="busy.has('rejoin')" @click="rejoin">Rejoin #{{ login }}</VxButton></template>
      </VxCallout>

      <VxTabs v-model="tab" :options="TABS" label="Channel sections" class="tabs" />

      <template v-if="tab === 'settings'">
        <ChannelSettings :channel="data.channel" :roles="data.roles" @saved="saved" />
        <BackfillPanel :key="String(data.channel.history_backfill)" :login="login" />
      </template>
      <ModulesTab v-else-if="tab === 'modules'" :login="login" :sign="sign" :modules="data.modules" :reload="reload" />
      <RulesTab v-else-if="tab === 'rules'" :login="login" :sign="sign" :commands="data.commands" :roles="data.roles" :reload="reload" />
      <PublishedTab
        v-else-if="tab === 'commands'"
        :login="login"
        :sign="sign"
        :published="data.published"
        :packs="data.packs"
        :publish-role="data.channel.roles.publish_min"
        :grant-role="data.channel.roles.grant_min"
        :roles="data.allRoles"
        :reload="reload"
      />
      <TriggersTab
        v-else-if="tab === 'triggers'"
        :login="login"
        :sign="sign"
        :triggers="data.triggers"
        :capabilities="data.channel.capabilities"
        :reload="reload"
      />
      <FilterTab v-else-if="tab === 'filter'" :login="login" :filters="data.filters" :global-filters="data.globalFilters" :reload="reload" />
      <RepliesTab
        v-else-if="tab === 'replies'"
        :login="login"
        :sign="sign"
        :modules="data.modules.map((m) => m.name)"
        :commands="data.commands.map((c) => c.name)"
      />
      <RolesTab v-else-if="tab === 'roles'" :login="login" :sign="sign" />
      <VariablesTab v-else-if="tab === 'variables'" :login="login" :write-role="data.channel.roles.channel_var_write" :roles="data.allRoles" />
      <RunsTab v-else-if="tab === 'runs'" :login="login" :sign="sign" />
      <ChatLogTab v-else-if="tab === 'log'" :login="login" :logging="data.channel.log_enabled" :public-log="data.channel.public_log" />
      <section v-else-if="tab === 'audit'">
        <p class="vx-muted intro">Every change made here, in chat, on this site or with an API key.</p>
        <AuditBrowser :channel="login" :channels="[data.channel]" />
      </section>
      <IgnoredTab v-else-if="tab === 'ignored'" :login="login" :sign="sign" :ignored="data.ignored" :reload="reload" />
    </template>

    <VxDialog v-model:open="partOpen" :title="`Leave #${login}?`">
      The bot parts the channel and stops answering there. Its settings, commands and logs stay, and joining again
      brings everything back.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="busy.has('part')" @click="part">Leave</VxButton>
      </template>
    </VxDialog>
  </ManageShell>
</template>

<style scoped>
.loading { display: grid; gap: 6px; }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; }
.chips :deep(code.dtb) { font-size: inherit; }
.caps { margin-bottom: 16px; }
.small { font-size: 12px; }
.intro { margin: 0 0 10px; }
.tabs { margin: 16px 0 14px; }
.tabs :deep([role='tablist']) { overflow-x: auto; }
</style>
