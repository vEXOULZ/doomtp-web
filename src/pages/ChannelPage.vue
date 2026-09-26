<script setup lang="ts">
import { VxButton, VxCallout, VxChip, VxEmptyState, VxSkeleton } from '@vexoulz/ui'
import { computed } from 'vue'
import CommandTable from '@/components/CommandTable.vue'
import DtpShell from '@/components/DtpShell.vue'
import Emoji from '@/components/Emoji.vue'
import { api } from '@/lib/api'
import { channelRows } from '@/lib/commands'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string }>()

const { data, error, status, reload } = useLoad(async () => {
  const [channel, publications, packs] = await Promise.all([
    api.channel(props.login),
    api.publications(props.login),
    api.channelPacks(props.login),
  ])
  return { channel, rows: channelRows(publications.publications, packs.packs), packs: packs.packs }
}, () => props.login)

const sign = computed(() => data.value?.channel.prefix ?? '')
const here = computed(() => data.value?.channel.active && data.value.channel.status === 'joined')
</script>

<template>
  <DtpShell>
    <VxEmptyState v-if="status === 404" code="404" :title="`#${login}`" text="The bot doesn't know this channel.">
      <template #actions><VxButton to="/" variant="primary">Channels</VxButton></template>
    </VxEmptyState>
    <VxCallout v-else-if="error" tone="error" title="Couldn't load this channel">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true">
      <VxSkeleton w="40%" h="34px" /><VxSkeleton v-for="i in 5" :key="i" h="38px" />
    </div>

    <div v-else class="doc">
      <h1 class="vx-display">#{{ data.channel.login }}</h1>
      <div class="chips">
        <VxChip k="sign"><Emoji :text="data.channel.prefix" /></VxChip>
        <VxChip k="tier">{{ data.channel.tier }}</VxChip>
        <VxChip :tone="here ? 'ok' : 'bad'">{{ data.channel.status }}</VxChip>
      </div>
      <p class="vx-muted">
        Type <code><Emoji :text="`${sign}help`" /></code> in chat for the commands you personally can run here. The
        <RouterLink to="/docs/commands">command reference</RouterLink> lists every built-in.
      </p>

      <h2 class="vx-display">Custom commands published here</h2>
      <template v-if="data.rows.length">
        <CommandTable :rows="data.rows" :sign="sign" />
        <p class="vx-muted after">
          These are community commands, grouped by the pack they came from. Their authors can edit them at any time and
          the change applies here immediately. Moderators can switch one off with
          <code><Emoji :text="`${sign}cc disable <name>`" /></code>, or a whole pack with
          <code><Emoji :text="`${sign}module disable <pack>`" /></code>.
        </p>
        <p v-if="data.packs.length">
          Packs published here:
          <template v-for="(p, i) in data.packs" :key="p.name"><template v-if="i"> · </template><code>{{ p.name }}</code><template v-if="p.summary"> ({{ p.summary }})</template></template>
        </p>
      </template>
      <p v-else class="vx-muted">
        Nothing published here yet. A moderator can offer one with <code><Emoji :text="`${sign}cc publish <name>`" /></code>.
      </p>
    </div>
  </DtpShell>
</template>

<style scoped>
.doc { max-width: none; }
.doc > p { max-width: 52rem; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.after { margin-top: 14px; }
.loading { display: flex; flex-direction: column; gap: 8px; }
</style>
