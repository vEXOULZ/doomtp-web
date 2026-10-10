<script setup lang="ts">
// A channel's chat log as one timeline (/api/v2/channels/{login}/log), newest first unless asked otherwise:
// messages as Twitch shows them (badges, colours, Twitch and 7TV/BTTV/FFZ emotes), notifications (subs, raids...)
// and moderation as notices. Searched as `logsearch` does in chat, over a time range if given; the bot pages it with
// a cursor, so the pages go older and back. On the public channel page (`public`) it has no moderation and no removed
// messages, which the bot leaves out for the public, and no coverage.
import { loadBadges, loadChannelEmotes, toChatLine, type EmoteSet, type LogEntry, type RawBadges } from '@vexoulz/platform-web/chat'
import { ChatLine } from '@vexoulz/platform-web/vue'
import { VxButton, VxCallout, VxCheckbox, VxEmptyState, VxField, VxInput, VxSelect, VxSkeleton } from '@vexoulz/ui'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import { statusOf } from '@/lib/api'
import { admin } from '@/lib/admin'
import LogCoverage from './LogCoverage.vue'
import { localInput, loginOf } from '@/lib/format'

const props = defineProps<{
  login: string
  logging: boolean
  publicLog: boolean | undefined
  public?: boolean
  /** The channel's Twitch id, for its 7TV/BTTV/FFZ emotes; without it only Twitch's own show as images. */
  channelId?: string
}>()
const PAGE = 100
type Kind = LogEntry['kind']
const KINDS: { value: Kind; label: string }[] = [
  { value: 'message', label: 'Messages' },
  { value: 'notification', label: 'Notifications' },
  ...(props.public ? [] : [{ value: 'moderation' as Kind, label: 'Moderation' }]),
]
const ORDERS = [
  { value: 'desc', label: 'Newest first' },
  { value: 'asc', label: 'Oldest first' },
]

// ── times, in the viewer's own zone ──
const iso = (v: string) => (v ? new Date(v).toISOString() : undefined)
const stamp = (at: string) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// What the form holds, and what the pages were asked with (the form applies on submit).
const blank = () => ({ q: '', user: '', since: '', until: '', order: 'desc' as 'asc' | 'desc', kinds: KINDS.map((k) => k.value), hideRemoved: false })
const form = reactive(blank())
const asked = ref({ ...form, kinds: [...form.kinds] })
/** The cursor of each page shown so far: the first page has none. */
const cursors = ref<(string | undefined)[]>([undefined])
const page = computed(() => cursors.value.length - 1)
const rangeError = computed(() => (form.since && form.until && form.until <= form.since ? 'The end must come after the start.' : null))

const { data, error, loading, reload } = useResource(
  () =>
    admin.log(props.login, {
      q: asked.value.q.trim() || undefined,
      user: loginOf(asked.value.user) || undefined,
      since: iso(asked.value.since),
      until: iso(asked.value.until),
      order: asked.value.order === 'asc' ? 'asc' : undefined,
      kind: asked.value.kinds.length === KINDS.length ? undefined : asked.value.kinds,
      hide_removed: props.public || asked.value.hideRemoved,
      cursor: cursors.value[page.value],
      limit: PAGE,
    }),
  // A page turn keeps the page on screen (busy) until the next one is in.
  { source: () => [props.login, asked.value, cursors.value], resetOnSource: false },
)
const status = computed(() => statusOf(error.value))

function search() {
  if (!form.kinds.length || rangeError.value) return
  asked.value = { ...form, kinds: [...form.kinds] }
  cursors.value = [undefined]
}
function reset() {
  Object.assign(form, blank())
  search()
}
/** Shows the log around a span (a gap the coverage found), oldest first. */
function showSpan(start: string, end: string) {
  Object.assign(form, { since: localInput(start), until: localInput(Date.parse(end) + 60_000), order: 'asc' })
  search()
}
const older = () => data.value?.next_cursor && (cursors.value = [...cursors.value, data.value.next_cursor])
const newer = () => page.value > 0 && (cursors.value = cursors.value.slice(0, -1))
const toggleKind = (k: Kind, on: boolean) => (form.kinds = on ? [...form.kinds, k] : form.kinds.filter((x) => x !== k))

// The channel's third-party emotes and its Twitch badges (the bot fetches those: they need its Twitch token), loaded
// once per channel; the log shows without them until they come, or if they don't.
const emotes = shallowRef<EmoteSet | null>(null)
const badges = shallowRef<RawBadges | null>(null)
watch(
  () => props.login,
  async (login, _, onCleanup) => {
    badges.value = null
    const ctl = new AbortController()
    onCleanup(() => ctl.abort())
    try {
      badges.value = await loadBadges(`/api/v2/channels/${encodeURIComponent(login)}/badges`, { signal: ctl.signal })
    } catch {
      // aborted: a newer channel's load replaces it
    }
  },
  { immediate: true },
)
watch(
  () => props.channelId,
  async (id, _, onCleanup) => {
    emotes.value = null
    if (!id) return
    const ctl = new AbortController()
    onCleanup(() => ctl.abort())
    try {
      emotes.value = await loadChannelEmotes(id, { signal: ctl.signal })
    } catch {
      // aborted: a newer channel's load replaces it
    }
  },
  { immediate: true },
)
const lines = computed(() => (data.value?.items ?? []).map((e) => ({ at: e.at, line: toChatLine(e, emotes.value, badges.value) })))
const paging = computed(() => (asked.value.order === 'asc' ? { back: 'Earlier', on: 'Later' } : { back: 'Newer', on: 'Older' }))
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="!logging" tone="info" title="The chat log is off here">
      The broadcaster turns it on in Settings → Logging. What was logged before stays searchable.
    </VxCallout>
    <p v-else-if="public" class="vx-muted intro">
      What was said in #{{ login }}, and its subs, raids and the like. Removed messages aren't shown here.
    </p>
    <p v-else class="vx-muted intro">
      <template v-if="publicLog">Anyone can search this log's messages on the public channel page; moderation stays here.</template>
      <template v-else-if="publicLog === false">Only moderators can search this log (Settings → Logging).</template>
    </p>

    <LogCoverage v-if="!public" :login="login" :channel-id="channelId" :since="asked.since" :until="asked.until" @show="showSpan" />

    <form class="filters" @submit.prevent="search">
      <div class="vx-form-row">
        <VxField label="Words" class="grow">
          <template #default="{ id }"><VxInput :id="id" v-model="form.q" type="search" placeholder="search the log" /></template>
        </VxField>
        <VxField label="User">
          <template #default="{ id }"><VxInput :id="id" v-model="form.user" mono placeholder="login" /></template>
        </VxField>
      </div>
      <div class="vx-form-row">
        <VxField label="From" :error="rangeError ?? undefined">
          <template #default="{ id }"><input :id="id" v-model="form.since" class="vx-input" type="datetime-local" /></template>
        </VxField>
        <VxField label="To" help="Empty: until now.">
          <template #default="{ id }"><input :id="id" v-model="form.until" class="vx-input" type="datetime-local" :min="form.since || undefined" /></template>
        </VxField>
        <VxField label="Order">
          <template #default="{ id }"><VxSelect :id="id" v-model="form.order" :options="ORDERS" width="150px" /></template>
        </VxField>
      </div>
      <div class="vx-form-row">
        <div class="kinds">
          <VxCheckbox v-for="k in KINDS" :key="k.value" :model-value="form.kinds.includes(k.value)" :label="k.label" @update:model-value="(on: boolean) => toggleKind(k.value, on)" />
          <VxCheckbox v-if="!public" v-model="form.hideRemoved" label="Hide removed" />
        </div>
        <span class="actions">
          <VxButton type="button" variant="ghost" @click="reset">Reset</VxButton>
          <VxButton type="submit" variant="primary" :disabled="!form.kinds.length || !!rangeError">Search</VxButton>
        </span>
      </div>
    </form>

    <VxCallout v-if="public && (status === 401 || status === 403)" tone="info" :title="`#${login}'s chat log isn't public`">
      Its log is off, or its broadcaster or moderators keep it to moderators.
    </VxCallout>
    <VxCallout v-else-if="error" tone="error" title="Couldn't load the log">
      {{ errorText(error) }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="24px" /></div>
    <VxEmptyState v-else-if="!data.items.length" title="Nothing found" :text="page ? 'No more lines this way.' : 'Nothing in the log matches.'" />
    <div v-else class="chat vx-panel" role="log" :aria-busy="loading">
      <ChatLine v-for="l in lines" :key="l.line.id" class="line" :line="l.line">
        <template #before><time class="when" :datetime="l.at" :title="new Date(l.at).toLocaleString()">{{ stamp(l.at) }}</time></template>
      </ChatLine>
    </div>
    <div v-if="data && (page > 0 || data.next_cursor)" class="pager">
      <VxButton size="sm" :disabled="page === 0 || loading" @click="newer">{{ paging.back }}</VxButton>
      <span class="vx-muted small">Page {{ page + 1 }}</span>
      <VxButton size="sm" :disabled="!data.next_cursor || loading" @click="older">{{ paging.on }}</VxButton>
    </div>
  </section>
</template>

<style scoped>
.filters { display: grid; gap: 4px; margin-bottom: 14px; }
.kinds { display: flex; flex-wrap: wrap; gap: 6px 14px; align-self: center; flex: 1; }
.actions { display: flex; gap: 8px; align-self: end; }
.chat { background: var(--vxp-chat-bg); padding: 8px 12px; font-size: 13px; line-height: 1.6; }
.line { padding: 2px 0; }
.when { color: var(--vx-muted); font-family: var(--vx-mono); font-size: 11px; margin-right: 8px; white-space: nowrap; }
</style>
