<script setup lang="ts">
// Built-in modules and the packs published in a channel, each turned on or off as `module` does in chat.
import { VxButton, VxChip, VxSwitch } from '@vexoulz/ui'
import ChatLine from '@/components/ChatLine.vue'
import { can } from '@/lib/access'
import { admin } from '@/lib/admin'
import type { ModuleRow } from '@/lib/modules'
import { onOff, useAct } from '@/lib/useAct'

const props = defineProps<{ login: string; sign: string; modules: ModuleRow[]; reload: () => Promise<void> }>()
const { busy, act } = useAct(props.reload)
const setModule = (name: string, on: boolean) =>
  act(`m:${name}`, () => admin.setModule(props.login, name, on), `${name} turned ${onOff(on)}`)
</script>

<template>
  <section class="mtab">
    <p class="vx-muted intro">
      Built-in modules and the packs published here. Turning one off is the same as
      <ChatLine :lines="`${sign}module disable <name>`" :sign="sign" /> in chat, and turns off every command it
      covers.
    </p>
    <div class="table-scroll vx-panel">
      <table class="vx-table modules">
        <thead><tr><th>Module</th><th>Commands</th><th class="end">On</th></tr></thead>
        <tbody>
          <tr v-for="m in modules" :key="m.name">
            <td class="mod">
              <span class="vx-mono">{{ m.name }}</span>
              <VxChip v-if="m.kind === 'pack'" :tone="m.scope === 'global' ? 'default' : 'accent'">{{ m.scope === 'global' ? 'pack · everywhere' : 'pack' }}</VxChip>
              <VxChip v-else-if="m.kind === 'custom'">custom</VxChip>
              <div v-if="m.summary || m.owners.length" class="vx-muted small">
                {{ m.summary }}<template v-if="m.owners.length"> · by {{ m.owners.map((o) => `@${o}`).join(', ') }}</template>
              </div>
            </td>
            <td class="cmds">
              <ChatLine v-for="c in m.commands" :key="c" :lines="`${sign}${c}`" :sign="sign" />
              <span v-if="!m.commands.length" class="vx-muted small">none</span>
            </td>
            <td class="end">
              <span v-if="!m.toggleable" class="vx-muted small">always on</span>
              <VxSwitch
                v-else-if="m.enabled !== null"
                :model-value="m.enabled"
                :disabled="!can('modules.toggle', login) || busy.has(`m:${m.name}`)"
                @update:model-value="(on: boolean) => setModule(m.name, on)"
              ><span class="sr-only">Module {{ m.name }}</span></VxSwitch>
              <span v-else class="unknown">
                <span class="vx-muted small" title="The bot doesn't report whether this one is on yet">state not reported</span>
                <VxButton size="sm" :disabled="!can('modules.toggle', login) || busy.has(`m:${m.name}`)" @click="setModule(m.name, true)">On</VxButton>
                <VxButton size="sm" :disabled="!can('modules.toggle', login) || busy.has(`m:${m.name}`)" @click="setModule(m.name, false)">Off</VxButton>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.mod .vx-chip { margin-left: 6px; }
.modules .cmds :deep(code) { display: inline-block; margin: 2px 10px 2px 0; white-space: nowrap; }
.unknown { display: inline-flex; align-items: center; gap: 6px; }
</style>
