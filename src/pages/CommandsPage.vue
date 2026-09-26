<script setup lang="ts">
import { VxButton, VxCallout, VxSkeleton } from '@vexoulz/ui'
import { computed } from 'vue'
import CommandTable from '@/components/CommandTable.vue'
import DtpShell from '@/components/DtpShell.vue'
import Emoji from '@/components/Emoji.vue'
import { api } from '@/lib/api'
import { referenceRows } from '@/lib/commands'
import { defaultSign, loadSite } from '@/lib/site'
import { useLoad } from '@/lib/useLoad'

const sign = computed(defaultSign)
const { data: rows, error, reload } = useLoad(async () => {
  const [info, builtins, global, packs] = await Promise.all([loadSite(), api.commands(), api.globalCommands(), api.packs()])
  return referenceRows(builtins.commands, global.commands, packs.packs, info?.default_prefix ?? defaultSign())
})
</script>

<template>
  <DtpShell>
    <div class="doc">
      <h1 class="vx-display">Command reference</h1>
      <p class="vx-muted">
        Generated from the specs the bot runs on, so this page and the bot can't disagree.
        <code><Emoji :text="`${sign}help`" /></code> in chat lists only what you can run in that channel, with the command
        sign that channel uses. Click a command for its arguments, cooldowns and examples.
      </p>
    </div>
    <VxCallout v-if="error" tone="error" title="Couldn't load the commands">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!rows" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="38px" /></div>
    <CommandTable v-else :rows="rows" :sign="sign" />
  </DtpShell>
</template>

<style scoped>
.doc { margin-bottom: 18px; }
.loading { display: flex; flex-direction: column; gap: 6px; }
</style>
