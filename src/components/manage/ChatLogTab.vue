<script setup lang="ts">
// A channel's chat log as one timeline, newest first: messages, notifications (subs, raids...) and moderation,
// searched as `logsearch` does in chat. The bot pages it with a cursor, so the pages go older and back.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxEmptyState, VxField, VxInput, VxSkeleton, timeAgo } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { admin, type LogEntry, type LogQuery, type LogUser } from '@/lib/admin'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ login: string; logging: boolean; publicLog: boolean | undefined }>()
const PAGE = 100
type Kind = NonNullable<LogQuery['kind']>[number]
const KINDS: { value: Kind; label: string }[] = [
  { value: 'message', label: 'Messages' },
  { value: 'notification', label: 'Notifications' },
  { value: 'moderation', label: 'Moderation' },
]

// What the form holds, and what the pages were asked with (the form applies on submit).
const form = reactive({ q: '', user: '', kinds: ['message', 'notification', 'moderation'] as Kind[], hideRemoved: false })
const asked = ref({ ...form, kinds: [...form.kinds] })
/** The cursor of each page shown so far: the first page has none. */
const cursors = ref<(string | undefined)[]>([undefined])
const page = computed(() => cursors.value.length - 1)

const { data, error, loading, reload } = useLoad(
  () =>
    admin.log(props.login, {
      q: asked.value.q.trim() || undefined,
      user: asked.value.user.trim().replace(/^@/, '') || undefined,
      kind: asked.value.kinds.length === KINDS.length ? undefined : asked.value.kinds,
      hide_removed: asked.value.hideRemoved,
      cursor: cursors.value[page.value],
      limit: PAGE,
    }),
  () => [props.login, asked.value, cursors.value],
)

function search() {
  if (!form.kinds.length) return
  asked.value = { ...form, kinds: [...form.kinds] }
  cursors.value = [undefined]
}
const older = () => data.value?.next && (cursors.value = [...cursors.value, data.value.next])
const newer = () => page.value > 0 && (cursors.value = cursors.value.slice(0, -1))
const toggleKind = (k: Kind, on: boolean) => (form.kinds = on ? [...form.kinds, k] : form.kinds.filter((x) => x !== k))

const who = (u: LogUser | null) => (u ? `@${u.login ?? u.id}` : '')
const removed = (e: LogEntry) => e.kind === 'message' && (e.deleted_at !== null || e.cleared_at !== null)
function describe(e: LogEntry): string {
  if (e.kind === 'message') return e.text
  if (e.kind === 'notification') return e.type
  const rest = [e.duration_s ? `${e.duration_s}s` : '', e.reason ?? ''].filter(Boolean).join(' · ')
  return `${e.type} ${who(e.target)}${rest ? ` (${rest})` : ''}`
}
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="!logging" tone="info" title="The chat log is off here">
      The broadcaster turns it on in Settings → Logging. What was logged before stays searchable.
    </VxCallout>
    <p v-else class="vx-muted intro">
      <template v-if="publicLog">Anyone can search this log's messages on the public channel page; moderation stays here.</template>
      <template v-else-if="publicLog === false">Only moderators can search this log (Settings → Logging).</template>
    </p>

    <form class="filters" @submit.prevent="search">
      <VxField label="Words" class="grow">
        <template #default="{ id }"><VxInput :id="id" v-model="form.q" type="search" placeholder="search the log" /></template>
      </VxField>
      <VxField label="User">
        <template #default="{ id }"><VxInput :id="id" v-model="form.user" mono placeholder="login" /></template>
      </VxField>
      <div class="kinds">
        <VxCheckbox v-for="k in KINDS" :key="k.value" :model-value="form.kinds.includes(k.value)" :label="k.label" @update:model-value="(on: boolean) => toggleKind(k.value, on)" />
        <VxCheckbox v-model="form.hideRemoved" label="Hide removed" />
      </div>
      <VxButton type="submit" variant="primary" :disabled="!form.kinds.length">Search</VxButton>
    </form>

    <VxCallout v-if="error" tone="error" title="Couldn't load the log">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="30px" /></div>
    <VxEmptyState v-else-if="!data.entries.length" title="Nothing found" :text="page ? 'No older lines.' : 'Nothing in the log matches.'" />
    <template v-else>
      <div class="table-scroll vx-panel" :aria-busy="loading">
        <table class="vx-table log">
          <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
          <tbody>
            <tr v-for="e in data.entries" :key="`${e.kind}${e.id}`" :class="{ removed: removed(e) }">
              <td class="vx-muted nowrap" :title="new Date(e.at).toLocaleString()">{{ timeAgo(e.at) }}</td>
              <td class="nowrap">{{ e.kind === 'moderation' ? who(e.moderator) : who(e.user) }}</td>
              <td class="wrap">
                <VxChip v-if="e.kind !== 'message'" :tone="e.kind === 'moderation' ? 'warn' : 'accent'">{{ e.kind }}</VxChip>
                {{ describe(e) }}
                <span v-if="removed(e)" class="vx-muted small"> (removed)</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <div v-if="data && (page > 0 || data.next)" class="pager">
      <VxButton size="sm" :disabled="page === 0 || loading" @click="newer">Newer</VxButton>
      <span class="vx-muted small">Page {{ page + 1 }}</span>
      <VxButton size="sm" :disabled="!data.next || loading" @click="older">Older</VxButton>
    </div>
  </section>
</template>

<style scoped>
.kinds { display: flex; flex-wrap: wrap; gap: 6px 14px; align-self: center; }
.log .vx-chip { margin-right: 6px; }
.removed td:last-child { text-decoration: line-through; text-decoration-color: var(--vx-muted); }
</style>
