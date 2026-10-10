<script setup lang="ts">
import { VxButton, VxCallout, VxChip, VxEmptyState, VxSkeleton, VxTabs } from '@vexoulz/ui'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import Cmd from '@/components/Cmd.vue'
import ChatLogTab from '@/components/manage/ChatLogTab.vue'
import '@/components/manage/tabs.css'
import CommandTable from '@/components/CommandTable.vue'
import DtpShell from '@/components/DtpShell.vue'
import { manages } from '@/lib/access'
import { api, statusOf } from '@/lib/api'
import { channelRows } from '@/lib/commands'

const props = defineProps<{ login: string }>()
const route = useRoute()
const router = useRouter()
// The log is public unless the channel turned that off; the bot says so when asked, and the tab says it then.
const TABS = [
  { value: 'commands', label: 'Commands' },
  { value: 'log', label: 'Chat log' },
]
const tab = computed({
  get: () => (route.query.tab === 'log' ? 'log' : 'commands'),
  set: (value: string) => router.replace({ query: { ...route.query, tab: value === 'commands' ? undefined : value } }),
})

const { data, error, reload } = useResource(async () => {
  const [channel, publications, packs] = await Promise.all([
    api.channel(props.login),
    api.publications(props.login),
    api.channelPacks(props.login),
  ])
  return { channel, rows: channelRows(publications.publications, packs.packs), packs: packs.packs }
}, { source: () => props.login })
const status = computed(() => statusOf(error.value))

const sign = computed(() => data.value?.channel.prefix ?? '')
const here = computed(() => data.value?.channel.active && data.value.channel.status === 'joined')
</script>

<template>
  <DtpShell>
    <VxEmptyState v-if="status === 404" code="404" :title="`#${login}`" text="The bot doesn't know this channel.">
      <template #actions><VxButton to="/" variant="primary">Channels</VxButton></template>
    </VxEmptyState>
    <VxCallout v-else-if="error" tone="error" title="Couldn't load this channel">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true">
      <VxSkeleton w="40%" h="34px" /><VxSkeleton v-for="i in 5" :key="i" h="38px" />
    </div>

    <div v-else class="doc">
      <div class="title">
        <h1 class="vx-display">#{{ data.channel.login }}</h1>
        <VxButton v-if="manages(data.channel.login)" :to="`/manage/channels/${data.channel.login}`" size="sm">Manage</VxButton>
      </div>
      <div class="chips">
        <VxChip k="sign">{{ data.channel.prefix }}</VxChip>
        <VxChip k="tier">{{ data.channel.tier }}</VxChip>
        <VxChip :tone="here ? 'ok' : 'bad'">{{ data.channel.status }}</VxChip>
      </div>
      <VxTabs v-model="tab" :options="TABS" label="Channel sections" class="tabs" />
      <ChatLogTab v-if="tab === 'log'" :login="data.channel.login" :logging="true" :public-log="true" :channel-id="data.channel.channel_id" public />
      <template v-else>
      <p class="vx-muted">
        Type <Cmd t="help" :sign="sign" /> in chat for the commands you personally can run here. The
        <RouterLink to="/docs/commands">command reference</RouterLink> lists every built-in.
      </p>

      <h2 class="vx-display">Custom commands published here</h2>
      <template v-if="data.rows.length">
        <CommandTable :rows="data.rows" :sign="sign" />
        <p class="vx-muted after">
          These are community commands, grouped by the pack they came from. Their authors can edit them at any time and
          the change applies here immediately. Moderators can switch one off with
          <Cmd t="cc disable <name>" :sign="sign" />, or a whole pack with
          <Cmd t="module disable <pack>" :sign="sign" />.
        </p>
        <p v-if="data.packs.length">
          Packs published here:
          <template v-for="(p, i) in data.packs" :key="p.name"><template v-if="i"> · </template><code>{{ p.name }}</code><template v-if="p.summary"> ({{ p.summary }})</template></template>
        </p>
      </template>
      <p v-else class="vx-muted">
        Nothing published here yet. A moderator can offer one with <Cmd t="cc publish <name>" :sign="sign" />.
      </p>
      </template>
    </div>
  </DtpShell>
</template>

<style scoped>
.doc { max-width: none; }
.doc > p { max-width: 52rem; }
.title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
.title h1 { margin-right: auto; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.after { margin-top: 14px; }
.loading { display: flex; flex-direction: column; gap: 8px; }
.tabs { margin: 4px 0 14px; }
</style>
