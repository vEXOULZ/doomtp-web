<script setup lang="ts">
// A page loads again when an admin starts, changes or ends a "View as" preview, so it shows that role's view.
import { previewKey } from '@/lib/session'
</script>

<template>
  <RouterView :key="previewKey()" />
</template>
