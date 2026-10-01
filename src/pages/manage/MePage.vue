<script setup lang="ts">
// Your own area, open to anyone signed in: your channel and the channels you run, the commands and packs you wrote,
// what the bot keeps about you, your runs everywhere, and what you changed anywhere.
import { VxButton, VxCallout, VxChip, VxSkeleton, VxTabs } from '@vexoulz/ui'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuditTable from '@/components/AuditTable.vue'
import ManageShell from '@/components/ManageShell.vue'
import OwnChannelCard from '@/components/OwnChannelCard.vue'
import MyCommandsTab from '@/components/manage/MyCommandsTab.vue'
import MyDataTab from '@/components/manage/MyDataTab.vue'
import MyPacksTab from '@/components/manage/MyPacksTab.vue'
import '@/components/manage/tabs.css'
import { admin } from '@/lib/admin'
import { session } from '@/lib/session'
import { useLoad } from '@/lib/useLoad'

const route = useRoute()
const router = useRouter()

// The admin password has no Twitch user: no commands, variables, runs or changes of its own.
const TABS = computed(() =>
  session.user
    ? [
        { value: 'home', label: 'Channels' },
        { value: 'commands', label: 'My commands' },
        { value: 'packs', label: 'My packs' },
        { value: 'variables', label: 'My variables' },
        { value: 'runs', label: 'My runs' },
        { value: 'activity', label: 'My activity' },
      ]
    : [{ value: 'home', label: 'Channels' }],
)
const tab = computed({
  get: () => (TABS.value.some((t) => t.value === route.query.tab) ? String(route.query.tab) : 'home'),
  set: (value: string) => router.replace({ query: { ...route.query, tab: value === 'home' ? undefined : value } }),
})

const { data, error, reload } = useLoad(
  async () => (session.user && tab.value === 'activity' ? (await admin.audit(50, { actor: 'me' })).items : []),
  () => tab.value,
)
const own = computed(() => (session.ownChannel?.joined ? session.ownChannel.login : null))
const moderated = computed(() =>
  Object.entries(session.channelRoles ?? {})
    .filter(([, role]) => role === 'moderator')
    .map(([login]) => login)
    .sort(),
)
</script>

<template>
  <ManageShell :title="session.user ? `@${session.user.login}` : 'Admin'" eyebrow="Manage · me">
    <OwnChannelCard />

    <VxTabs v-if="TABS.length > 1" v-model="tab" :options="TABS" label="Your sections" class="tabs" />

    <template v-if="tab === 'home'">
      <section>
        <h2 class="vx-eyebrow sec">Channels</h2>
        <p v-if="!session.user" class="vx-muted">
          Signed in with the admin password: you manage every channel, and have no Twitch account here.
        </p>
        <div v-else class="chips">
          <RouterLink v-if="own" :to="`/manage/channels/${own}`" class="vx-btn is-sm">#{{ own }} <VxChip tone="ok">yours</VxChip></RouterLink>
          <RouterLink v-for="c in moderated" :key="c" :to="`/manage/channels/${c}`" class="vx-btn is-sm">#{{ c }}</RouterLink>
          <span v-if="!own && !moderated.length" class="vx-muted">You don't run a channel the bot is in.</span>
        </div>
      </section>

      <section>
        <h2 class="vx-eyebrow sec">Try it</h2>
        <p class="vx-muted">
          <RouterLink to="/manage/explain">Explain</RouterLink> shows what any expression would do in a channel, and can
          run it with nothing sent or saved. Every channel's public page has its commands and, unless the channel
          turned it off, its chat log.
        </p>
      </section>
    </template>

    <MyCommandsTab v-else-if="tab === 'commands'" />
    <MyPacksTab v-else-if="tab === 'packs'" />
    <MyDataTab v-else-if="tab === 'variables'" show="variables" />
    <MyDataTab v-else-if="tab === 'runs'" show="runs" />
    <section v-else-if="tab === 'activity'">
      <p class="vx-muted">What you changed, in chat or here, in every channel.</p>
      <VxCallout v-if="error" tone="error" title="Couldn't load your changes">
        {{ error }}
        <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
      </VxCallout>
      <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 4" :key="i" h="38px" /></div>
      <AuditTable v-else :entries="data" />
    </section>
  </ManageShell>
</template>

<style scoped>
section { margin-bottom: 28px; }
.sec { margin: 0 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips .vx-chip { margin-left: 6px; }
.loading { display: grid; gap: 6px; }
.tabs { margin: 16px 0 14px; }
.tabs :deep([role='tablist']) { overflow-x: auto; }
</style>
