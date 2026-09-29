<script setup lang="ts">
// The custom commands chat can run in a channel. A command published on its own turns on and off here, as
// `cc enable|disable` does in chat, for whoever reaches the channel's "publish" role; one in a pack follows the pack
// (the Modules tab).
import { VxChip, VxEmptyState, VxSwitch } from '@vexoulz/ui'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ChatLine from '@/components/ChatLine.vue'
import { reachesRole } from '@/lib/access'
import { admin } from '@/lib/admin'
import type { Role } from '@/lib/api'
import { CUSTOM_MODULE, type PublishedRow } from '@/lib/modules'
import { useAct } from '@/lib/useAct'

const props = defineProps<{
  login: string
  sign: string
  published: PublishedRow[]
  /** The channel's `publish_min_role`. */
  publishRole: string
  roles: Role[]
  reload: () => Promise<void>
}>()
const route = useRoute()
const { busy, act } = useAct(props.reload)

const mayToggle = computed(() => reachesRole(props.login, props.publishRole, props.roles))
const toggleable = (p: PublishedRow) => p.module === CUSTOM_MODULE && (p.status === 'active' || p.status === 'disabled')
const toggle = (p: PublishedRow, on: boolean) =>
  act(`p:${p.name}`, () => admin.setPublication(props.login, p.name, on), `${props.sign}${p.name} turned ${on ? 'on' : 'off'}`)
</script>

<template>
  <section class="mtab">
    <VxEmptyState v-if="!published.length" title="Nothing published here" text="Custom commands and packs published to this channel show up here." />
    <template v-else>
      <p class="vx-muted intro">
        Custom commands chat can run here. One published on its own turns on and off here, the same as
        <ChatLine :lines="`${sign}cc disable <name>`" :sign="sign" /> in chat<template v-if="!mayToggle">, for
        {{ publishRole }} and up</template>; a pack's commands turn on and off with the pack, on the Modules tab.
      </p>
      <div class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Command</th><th>Module</th><th>By</th><th>Version</th><th>State</th></tr></thead>
          <tbody>
            <tr v-for="p in published" :key="`${p.module}/${p.name}`">
              <td>
                <ChatLine :lines="`${sign}${p.name}`" :sign="sign" />
                <div v-if="p.summary" class="vx-muted small">{{ p.summary }}</div>
              </td>
              <td><RouterLink :to="{ query: { ...route.query, tab: 'modules' } }" class="vx-mono">{{ p.module }}</RouterLink></td>
              <td class="vx-muted">@{{ p.owner }}</td>
              <td class="vx-mono vx-muted">
                v{{ p.version }}
                <div v-if="p.changedSince !== null" class="small">changed since v{{ p.changedSince }}</div>
              </td>
              <td class="nowrap">
                <VxSwitch
                  v-if="toggleable(p)"
                  :model-value="p.status === 'active'"
                  :disabled="!mayToggle || busy.has(`p:${p.name}`)"
                  :label="p.status === 'active' ? 'on' : 'off'"
                  @update:model-value="(on: boolean) => toggle(p, on)"
                />
                <template v-else>
                  <VxChip :tone="p.status === 'active' ? 'ok' : 'default'">{{ p.status }}</VxChip>
                  <div v-if="p.status === 'orphaned'" class="vx-muted small">its owner deleted it</div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
