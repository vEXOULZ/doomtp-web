<script setup lang="ts">
import { VxButton, VxCallout, VxSkeleton } from '@vexoulz/ui'
import DtpShell from '@/components/DtpShell.vue'
import ExplainReport from '@/components/ExplainReport.vue'
import { api } from '@/lib/api'
import { useLoad } from '@/lib/useLoad'

const props = defineProps<{ token: string }>()
const { data: report, error, status, reload } = useLoad(() => api.explainReport(props.token), () => props.token)
</script>

<template>
  <DtpShell>
    <div class="doc">
      <h1 class="vx-display">What this would do</h1>
      <template v-if="status === 404">
        <p class="vx-muted">
          This report is gone. Reports are kept in memory for an hour, and not across a restart: run
          <code>explain</code> in chat again for a fresh link, or try the line in the
          <RouterLink to="/docs/language#try">language page's editor</RouterLink>.
        </p>
      </template>
      <VxCallout v-else-if="error" tone="error" title="Couldn't load the report">
        {{ error }}
        <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
      </VxCallout>
      <div v-else-if="!report" class="loading" aria-busy="true"><VxSkeleton v-for="i in 4" :key="i" h="38px" /></div>
      <template v-else>
        <ExplainReport :report="report" />
        <p class="vx-muted note">The report is checked against the rank of whoever asked, and kept for an hour.</p>
      </template>
    </div>
  </DtpShell>
</template>

<style scoped>
.doc { max-width: none; }
.loading { display: flex; flex-direction: column; gap: 8px; }
.note { margin-top: 18px; }
</style>
