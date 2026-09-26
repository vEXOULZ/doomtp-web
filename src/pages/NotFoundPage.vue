<script setup lang="ts">
import { VxButton, VxEmptyState } from '@vexoulz/ui'
import DtpShell from '@/components/DtpShell.vue'
</script>

<template>
  <DtpShell>
    <VxEmptyState code="404" title="Nothing here" text="That page doesn't exist. The command you're after is probably in the reference.">
      <template #actions>
        <VxButton to="/docs/commands" variant="primary">Command reference</VxButton>
        <VxButton to="/">Home</VxButton>
      </template>
    </VxEmptyState>
  </DtpShell>
</template>
