<script setup lang="ts">
// Frame for every Manage page: the site's own shell (with the Manage bar), a dimmer sky, and the page's heading.
import DtpShell from './DtpShell.vue'

defineProps<{ title: string; eyebrow?: string }>()
</script>

<template>
  <DtpShell sky="dim">
    <div class="head">
      <div class="vx-eyebrow">{{ eyebrow ?? 'Manage' }}</div>
      <h1 class="vx-display">{{ title }}</h1>
      <div v-if="$slots.actions" class="actions"><slot name="actions"></slot></div>
    </div>
    <slot></slot>
  </DtpShell>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 16px; margin-bottom: 20px; }
.head .vx-eyebrow { flex-basis: 100%; }
.head h1 { font-size: 28px; margin: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
