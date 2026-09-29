<script setup lang="ts">
import ManageShell from '@/components/ManageShell.vue'
import AuditBrowser from '@/components/manage/AuditBrowser.vue'
import '@/components/manage/tabs.css'
import { admin } from '@/lib/admin'
import { useLoad } from '@/lib/useLoad'

// Only to name channels the bot's entries don't; the log itself loads without it.
const { data } = useLoad(async () => (await admin.channels()).channels)
</script>

<template>
  <ManageShell title="Audit">
    <p class="vx-muted intro">
      Every change to roles, permissions, cooldowns, toggles, filters, triggers and custom commands, whoever made it
      and however: in chat, here, or with an API key. You see the channels you manage, and your own changes anywhere
      (a bot admin sees everything).
    </p>
    <AuditBrowser :channels="data ?? []" />
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 14px; max-width: 52rem; }
</style>
