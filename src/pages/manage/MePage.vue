<script setup lang="ts">
// Your own area, open to anyone signed in: your channel, the channels you run, and what you changed anywhere.
import { VxButton, VxCallout, VxChip, VxSkeleton } from '@vexoulz/ui'
import { computed } from 'vue'
import AuditTable from '@/components/AuditTable.vue'
import ManageShell from '@/components/ManageShell.vue'
import OwnChannelCard from '@/components/OwnChannelCard.vue'
import { admin } from '@/lib/admin'
import { session } from '@/lib/session'
import { useLoad } from '@/lib/useLoad'

// The admin password has no Twitch user, so it has no changes of its own to list.
const { data, error, reload } = useLoad(async () =>
  session.user ? (await admin.audit(50, { actor: 'me' })).entries : [],
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
        run it with nothing sent or saved.
      </p>
    </section>

    <section v-if="session.user">
      <h2 class="vx-eyebrow sec">What you changed</h2>
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
</style>
