<script setup lang="ts">
// /manage/audit?action=&target=&actor=&actor_kind=&outcome=: the bot's audit log (GET /api/v2/audit), newest first.
// Filters live in the URL.
import { AuditBrowser, type AuditFilters } from '@vexoulz/platform-web/vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuditActor from '@/components/AuditActor.vue'
import ManageShell from '@/components/ManageShell.vue'
import '@/components/manage/tabs.css'
import { admin } from '@/lib/admin'
import { platform } from '@/lib/platform'
import { useLoad } from '@/lib/useLoad'

// Only to name channels the bot's entries don't; the log itself loads without it.
const { data } = useLoad(async () => (await admin.channels()).channels)
const scopeNames = computed(() => Object.fromEntries((data.value ?? []).map((c) => [c.channel_id, c.login])))

const KEYS = ['action', 'target', 'actor', 'actor_kind', 'outcome'] as const
const route = useRoute()
const router = useRouter()
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

const filters = computed<AuditFilters>({
  get: () => ({ action: q('action'), target: q('target'), actor: q('actor'), actor_kind: q('actor_kind'), outcome: q('outcome'), scope: '' }),
  set: (f) => {
    const query: Record<string, string> = {}
    for (const k of KEYS) if (f[k].trim()) query[k] = f[k].trim()
    router.replace({ query })
  },
})
</script>

<template>
  <ManageShell title="Audit">
    <p class="vx-muted intro">
      Every change to roles, permissions, cooldowns, toggles, filters, triggers and custom commands, whoever made it
      and however: in chat, here, or with an API key. You see the channels you manage, and your own changes anywhere
      (a bot admin sees everything).
    </p>
    <AuditBrowser
      v-model:filters="filters"
      :client="platform"
      :scope-names="scopeNames"
      :poll="30_000"
      action-hint="cc. or cc.edit"
      target-hint="exact, or a prefix:"
    >
      <template #actor="{ entry }"><AuditActor :entry="entry" /></template>
    </AuditBrowser>
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 14px; max-width: 52rem; }
</style>
