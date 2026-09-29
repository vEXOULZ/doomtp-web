<script setup lang="ts">
// The audit log with filters (who, what) and older/newer pages. The bot pages it by entry id (`before`), so the
// pages walk back and forth over a stack of those. Scoped to one channel when `channel` is set.
import { VxButton, VxCallout, VxField, VxInput, VxSkeleton } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import AuditTable from '@/components/AuditTable.vue'
import { admin, type Channel } from '@/lib/admin'
import { useLoad } from '@/lib/useLoad'

const props = withDefaults(defineProps<{ channel?: string; channels?: Pick<Channel, 'channel_id' | 'login'>[]; pageSize?: number }>(), {
  channel: undefined,
  channels: () => [],
  pageSize: 50,
})

const form = reactive({ actor: '', action: '' })
const asked = ref({ ...form })
const befores = ref<(number | undefined)[]>([undefined])
const page = computed(() => befores.value.length - 1)

const { data, error, loading, reload } = useLoad(
  () =>
    admin.audit(props.pageSize, {
      channel: props.channel,
      actor: asked.value.actor.trim().replace(/^@/, '') || undefined,
      action: asked.value.action.trim() || undefined,
      before: befores.value[page.value],
    }),
  () => [props.channel, asked.value, befores.value],
)

function search() {
  asked.value = { ...form }
  befores.value = [undefined]
}
const older = () => data.value?.next && (befores.value = [...befores.value, data.value.next])
const newer = () => page.value > 0 && (befores.value = befores.value.slice(0, -1))
</script>

<template>
  <div class="mtab">
    <form class="filters vx-form-row" @submit.prevent="search">
      <VxField label="By">
        <template #default="{ id }"><VxInput :id="id" v-model="form.actor" mono placeholder="login, or me" /></template>
      </VxField>
      <VxField label="Action" class="grow">
        <template #default="{ id }"><VxInput :id="id" v-model="form.action" mono placeholder="cc.edit, or cc. for all of them" /></template>
      </VxField>
      <VxButton type="submit" variant="primary">Filter</VxButton>
      <VxButton :loading="loading" @click="reload">Refresh</VxButton>
    </form>
    <VxCallout v-if="error" tone="error" title="Couldn't load the audit log">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="38px" /></div>
    <AuditTable v-else :entries="data.entries" :channels="channels" :aria-busy="loading" />
    <div v-if="data && (page > 0 || data.next)" class="pager">
      <VxButton size="sm" :disabled="page === 0 || loading" @click="newer">Newer</VxButton>
      <span class="vx-muted small">Page {{ page + 1 }}</span>
      <VxButton size="sm" :disabled="!data.next || loading" @click="older">Older</VxButton>
    </div>
  </div>
</template>
