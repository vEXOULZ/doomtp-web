<script setup lang="ts">
// Where the Manage bar starts: the channels this session runs (every one, for an admin), with its rank in each,
// adding the bot to the user's own channel, and the latest changes it can see.
import { VxButton, VxCallout, VxChip, VxSkeleton, VxStatusDot } from '@vexoulz/ui'
import { computed } from 'vue'
import { AuditTable } from '@vexoulz/platform-web/vue'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import AuditActor from '@/components/AuditActor.vue'
import ManageShell from '@/components/ManageShell.vue'
import OwnChannelCard from '@/components/OwnChannelCard.vue'
import { can, isAdmin, rankIn } from '@/lib/access'
import { rankOf } from '@/lib/ranks'
import { admin, health } from '@/lib/admin'
import { session } from '@/lib/session'

const { data, error, reload } = useResource(async () => {
  const [channels, audit, ready] = await Promise.all([
    admin.channels(),
    admin.audit(8),
    can('health') ? health().catch(() => null) : null,
  ])
  return { channels: channels.channels, audit: audit.items, ready }
})

/** How the session reaches each channel, as chat would call it. */
function role(login: string): string {
  if (isAdmin()) return 'bot admin'
  const own = session.channelRoles?.[login]
  const rank = rankIn(login)
  if (own === 'broadcaster') return 'broadcaster'
  return rank > (rankOf('moderator') ?? rank) ? `moderator (rank ${rank})` : 'moderator'
}
const down = computed(() =>
  Object.entries(data.value?.ready?.components ?? {})
    .filter(([, c]) => c.status !== 'ok' && c.status !== 'disabled')
    .map(([name]) => name),
)
</script>

<template>
  <ManageShell title="Overview">
    <OwnChannelCard />
    <VxCallout v-if="error" tone="error" title="Couldn't load your channels">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 6" :key="i" h="38px" /></div>
    <template v-else>
      <section v-if="data.ready">
        <h2 class="vx-eyebrow sec">The bot</h2>
        <p class="status">
          <VxStatusDot :status="down.length ? 'down' : 'ok'" :label="down.length ? `trouble: ${down.join(', ')}` : 'all good'" />
          <RouterLink to="/manage/bot" class="vx-btn is-sm">Health, joining and keys</RouterLink>
        </p>
      </section>

      <section>
        <h2 class="vx-eyebrow sec">{{ isAdmin() ? 'Channels' : 'Channels you manage' }}</h2>
        <div v-if="data.channels.length" class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Channel</th><th>You are</th><th>Status</th><th>Sign</th><th>Tier</th><th>Logging</th></tr></thead>
            <tbody>
              <tr v-for="c in data.channels" :key="c.channel_id">
                <td><RouterLink :to="`/manage/channels/${c.login}`" class="chan">#{{ c.login }}</RouterLink></td>
                <td><VxChip :tone="session.channelRoles?.[c.login] === 'broadcaster' ? 'ok' : 'default'">{{ role(c.login) }}</VxChip></td>
                <td><VxStatusDot :status="c.banned ? 'warn' : c.active && c.status === 'joined' ? 'ok' : 'off'" :label="c.status" /></td>
                <td class="vx-mono">{{ c.prefix }}</td>
                <td>{{ c.tier }}</td>
                <td>{{ c.log_enabled ? 'on' : 'off' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="vx-muted">
          You don't run a channel the bot is in. You can still write and publish your own commands, and try anything
          in <RouterLink to="/manage/explain">Explain</RouterLink>: see <RouterLink to="/manage/me">Me</RouterLink>.
        </p>
      </section>

      <section>
        <h2 class="vx-eyebrow sec">Recent changes</h2>
        <AuditTable :entries="data.audit" :scope-names="Object.fromEntries(data.channels.map((c) => [c.channel_id, c.login]))" empty="Nothing changed yet.">
          <template #actor="{ entry }"><AuditActor :entry="entry" /></template>
        </AuditTable>
        <div class="row"><RouterLink to="/manage/audit" class="vx-btn">All changes</RouterLink></div>
      </section>
    </template>
  </ManageShell>
</template>

<style scoped>
.loading { display: grid; gap: 6px; }
section { margin-bottom: 28px; }
.sec { margin: 0 0 8px; }
.status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 0; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 6px; }
.table-scroll > table { min-width: 34rem; }
.chan { color: var(--vx-accent); }
</style>
