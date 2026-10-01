<script setup lang="ts">
// /manage/jobs?state=&kind=&subject=: the bot's job runs (/api/v2/jobs: chat backfills), refreshed every few seconds,
// for its admins. Filters live in the URL. A backfill is queued from a channel's Chat log tab, not here: the bot
// doesn't take new runs through /api/v2/jobs.
import type { JobKindOut } from '@vexoulz/platform-web'
import { JobsBrowser, type JobFilters } from '@vexoulz/platform-web/vue'
import { VxCallout } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ManageShell from '@/components/ManageShell.vue'
import { can } from '@/lib/access'
import { platform } from '@/lib/platform'

const route = useRoute()
const router = useRouter()
const allowed = computed(() => can('bot'))
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')

const filters = computed<JobFilters>({
  get: () => ({ state: q('state') || 'all', kind: q('kind'), subject: q('subject') }),
  set: (f) => {
    const query: Record<string, string> = {}
    for (const [k, v] of Object.entries(f)) if (v && !(k === 'state' && v === 'all')) query[k] = v
    router.replace({ query })
  },
})

const kinds = ref<JobKindOut[] | null>(null)
onMounted(async () => {
  if (!allowed.value) return
  try {
    kinds.value = await platform.jobKinds()
  } catch {
    kinds.value = []
  }
})
</script>

<template>
  <ManageShell title="Jobs">
    <VxCallout v-if="!allowed" tone="warn" title="Bot admins only">The bot's jobs are for its admins.</VxCallout>
    <template v-else>
      <p class="vx-muted intro">
        The bot's background work: chat backfills, queued from a channel's Chat log tab. Pause, resume, retry or cancel
        them here.
      </p>
      <JobsBrowser v-if="kinds" v-model:filters="filters" :client="platform" :kinds="kinds" subject-hint="channel:12345678" />
    </template>
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 14px; max-width: 52rem; }
</style>
