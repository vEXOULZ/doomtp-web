<script setup lang="ts">
// /manage/jobs/:id: one job run (/api/v2/jobs/:id): its steps, controls and log, polled while it can still change.
import { JobDetail } from '@vexoulz/platform-web/vue'
import { VxCallout } from '@vexoulz/ui'
import { computed } from 'vue'
import ManageShell from '@/components/ManageShell.vue'
import { can } from '@/lib/access'
import { platform } from '@/lib/platform'
import { admin } from '@/lib/admin'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ id: string }>()
const jobId = computed(() => Number(props.id))
const allowed = computed(() => can('bot'))

// Only to name the channel a `channel:<id>` subject is; the job loads without it.
const { data: channels } = useLoad(async () => (allowed.value ? (await admin.channels()).channels : []))
const channelOf = (subject: string | null) => {
  const id = subject?.startsWith('channel:') ? subject.slice('channel:'.length) : null
  return id ? (channels.value?.find((c) => c.channel_id === id)?.login ?? null) : null
}
</script>

<template>
  <ManageShell :title="`Job ${id}`">
    <p class="back"><RouterLink to="/manage/jobs">← All jobs</RouterLink></p>
    <VxCallout v-if="!allowed" tone="warn" title="Bot admins only">The bot's jobs are for its admins.</VxCallout>
    <JobDetail v-else :key="jobId" :client="platform" :id="jobId">
      <template #subject="{ job }">
        <RouterLink v-if="channelOf(job.subject)" class="small" :to="`/manage/channels/${channelOf(job.subject)}`">#{{ channelOf(job.subject) }}</RouterLink>
        <RouterLink v-if="job.subject" class="small" :to="{ path: '/manage/jobs', query: { subject: job.subject } }">its jobs</RouterLink>
      </template>
    </JobDetail>
  </ManageShell>
</template>

<style scoped>
.back { margin: 0 0 12px; }
.back a, .small { color: inherit; }
.small { display: block; font-size: 12px; }
</style>
