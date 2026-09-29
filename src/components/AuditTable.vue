<script setup lang="ts">
// Configuration changes (the bot's audit log): what changed, where, by whom and how. The bot names the channel and
// the actor when it knows them; otherwise the channel id is looked up in `channels`, and the actor stays a Twitch
// user id (none for changes made with the admin password or a key). A known actor shows as @login, with the id in a
// tooltip.
import { VxChip, timeAgo } from '@vexoulz/ui'
import { computed } from 'vue'
import { type AuditEntry, type Channel } from '@/lib/admin'
import UserRef from './UserRef.vue'

const props = withDefaults(defineProps<{ entries: AuditEntry[]; channels?: Pick<Channel, 'channel_id' | 'login'>[] }>(), {
  channels: () => [],
})
const logins = computed(() => new Map(props.channels.map((c) => [c.channel_id, c.login])))
const where = (e: AuditEntry) => {
  const id = e.channel_id
  if (!id || id === '*') return 'everywhere'
  const login = e.channel_login ?? logins.value.get(id)
  return login ? `#${login}` : id
}
/** A before or after value as one line; nothing when there's none. */
const one = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
</script>

<template>
  <div class="table-scroll vx-panel">
    <table class="vx-table">
      <thead><tr><th>When</th><th>Action</th><th>Where</th><th>Target</th><th>By</th><th>Via</th></tr></thead>
      <tbody>
        <tr v-for="e in entries" :key="e.id">
          <td class="vx-muted when" :title="new Date(e.at).toLocaleString()">{{ timeAgo(e.at) }}</td>
          <td><code class="action">{{ e.action }}</code></td>
          <td>{{ where(e) }}</td>
          <td class="target">
            {{ e.target ?? '' }}
            <div v-if="one(e.before) || one(e.after)" class="change">
              <span v-if="one(e.before)" class="before" title="Before">{{ one(e.before) }}</span>
              <span v-if="one(e.before)" class="vx-muted" aria-hidden="true"> → </span>
              <span class="after" title="After">{{ one(e.after) || '(removed)' }}</span>
            </div>
          </td>
          <td class="vx-mono vx-muted"><UserRef :id="e.actor_user_id" :login="e.actor_login" :fallback="e.via === 'chat' ? 'bot' : 'admin'" /></td>
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
.change { font-family: var(--vx-font-mono); font-size: 12px; margin-top: 2px; }
.before { color: var(--vx-muted); text-decoration: line-through; }
.after { color: var(--vx-ink); }
</style>
