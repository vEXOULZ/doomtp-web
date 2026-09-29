<script setup lang="ts">
import { VxButton, VxCallout, VxSkeleton } from '@vexoulz/ui'
import ManageShell from '@/components/ManageShell.vue'
import AuditTable from '@/components/AuditTable.vue'
import { admin } from '@/lib/admin'
import { useLoad } from '@/lib/useLoad'

const { data, error, reload } = useLoad(async () => {
  const [audit, channels] = await Promise.all([admin.audit(200), admin.channels()])
  return { entries: audit.entries, channels: channels.channels }
})
</script>

<template>
  <ManageShell title="Audit">
    <p class="vx-muted intro">
      Every change to roles, permissions, cooldowns, toggles, filters, triggers and custom commands, whoever made it
      and however: in chat, here, or with an API key. You see the channels you manage, and your own changes anywhere
      (a bot admin sees everything). The latest 200.
    </p>
    <VxCallout v-if="error" tone="error" title="Couldn't load the audit log">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 10" :key="i" h="38px" /></div>
    <AuditTable v-else :entries="data.entries" :channels="data.channels" />
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 14px; max-width: 52rem; }
.loading { display: grid; gap: 6px; }
</style>
