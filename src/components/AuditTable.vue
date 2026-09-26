<script setup lang="ts">
// Configuration changes (the bot's audit log): what changed, where, by whom and how. Channel ids are shown as
// logins when the channel is known; the actor stays a Twitch user id, which is all the log keeps (none for
// changes made with the admin session or a key).
import { VxChip, timeAgo } from '@vexoulz/ui'
import { computed } from 'vue'
import { type AuditEntry, type Channel } from '@/lib/admin'

const props = defineProps<{ entries: AuditEntry[]; channels: Pick<Channel, 'channel_id' | 'login'>[] }>()
const logins = computed(() => new Map(props.channels.map((c) => [c.channel_id, c.login])))
const where = (id: string | null) => (!id || id === '*' ? 'everywhere' : logins.value.has(id) ? `#${logins.value.get(id)}` : id)
const change = (e: AuditEntry) => {
  const after = e.after && typeof e.after === 'object' ? JSON.stringify(e.after) : e.after
  return after === null || after === undefined ? '' : String(after)
}
</script>

<template>
  <div class="table-scroll vx-panel">
    <table class="vx-table">
      <thead><tr><th>When</th><th>Action</th><th>Where</th><th>Target</th><th>By</th><th>Via</th></tr></thead>
      <tbody>
        <tr v-for="e in entries" :key="e.id">
          <td class="vx-muted when" :title="new Date(e.at).toLocaleString()">{{ timeAgo(e.at) }}</td>
          <td><code class="action">{{ e.action }}</code></td>
          <td>{{ where(e.channel_id) }}</td>
          <td class="target">
            {{ e.target ?? '' }}
            <span v-if="change(e)" class="vx-muted after">→ {{ change(e) }}</span>
          </td>
          <td class="vx-mono vx-muted">{{ e.actor_user_id ?? (e.via === 'chat' ? 'bot' : 'admin') }}</td>
          <td><VxChip>{{ e.via }}</VxChip></td>
        </tr>
        <tr v-if="!entries.length"><td colspan="6" class="vx-muted">Nothing changed yet.</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll > table { min-width: 44rem; }
.when { white-space: nowrap; }
.action { font-size: 12.5px; }
.target { overflow-wrap: anywhere; }
.after { font-family: var(--vx-font-mono); font-size: 12px; }
</style>
