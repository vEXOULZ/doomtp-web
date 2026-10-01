<script setup lang="ts">
// Configuration changes (the bot's audit log): what changed, where, by whom and how, and the writes it refused. The
// bot names the channel and the actor when it knows them; otherwise the channel id is looked up in `channels`, and the
// actor stays a Twitch user id. A known actor shows as @login, with the id in a tooltip; the admin password, a key and
// the bot itself by name.
import { VxChip, timeAgo } from '@vexoulz/ui'
import { computed } from 'vue'
import { type AuditEntry, type Channel } from '@/lib/admin'
import UserRef from './UserRef.vue'

const props = withDefaults(defineProps<{ entries: AuditEntry[]; channels?: Pick<Channel, 'channel_id' | 'login'>[] }>(), {
  channels: () => [],
})
const logins = computed(() => new Map(props.channels.map((c) => [c.channel_id, c.login])))
const where = (e: AuditEntry) => {
  const id = e.scope
  if (!id || id === '*') return 'everywhere'
  const login = e.scope_name ?? logins.value.get(id)
  return login ? `#${login}` : id
}
/** A Twitch user's id, or null for anyone else. */
const userId = (e: AuditEntry) => (e.actor_kind === 'user' ? e.actor_id : null)
/** Who it was when it wasn't a Twitch user: the admin password, a key, or the bot. */
const nobody = (e: AuditEntry) =>
  e.actor_kind === 'api_key'
    ? `key ${e.actor_id ?? ''}`.trim()
    : e.actor_kind === 'user'
      ? (e.actor_login ?? 'admin')
      : e.via === 'chat'
        ? 'bot'
        : 'admin'
const OUTCOME_TONES: Record<string, 'warn' | 'bad'> = { denied: 'warn', failed: 'bad' }
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
          <td>
            <code class="action">{{ e.action }}</code>
            <VxChip v-if="e.outcome !== 'ok'" :tone="OUTCOME_TONES[e.outcome] ?? 'warn'" class="outcome">{{ e.outcome }}</VxChip>
          </td>
          <td>{{ where(e) }}</td>
          <td class="target">
            {{ e.target ?? '' }}
            <div v-if="one(e.before) || one(e.after)" class="change">
              <span v-if="one(e.before)" class="before" title="Before">{{ one(e.before) }}</span>
              <span v-if="one(e.before)" class="vx-muted" aria-hidden="true"> → </span>
              <span class="after" title="After">{{ one(e.after) || '(removed)' }}</span>
            </div>
            <div v-else-if="one(e.detail)" class="change vx-muted">{{ one(e.detail) }}</div>
          </td>
          <td class="vx-mono vx-muted"><UserRef :id="userId(e)" :login="userId(e) ? e.actor_login : null" :fallback="nobody(e)" /></td>
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
.outcome { margin-left: 6px; }
.target { overflow-wrap: anywhere; }
.change { font-family: var(--vx-font-mono); font-size: 12px; margin-top: 2px; }
.before { color: var(--vx-muted); text-decoration: line-through; }
.after { color: var(--vx-ink); }
</style>
