<script setup lang="ts">
// Someone the bot knows by Twitch user id: `@login` when their login is known, with the id in a tooltip (logins can
// change, ids don't); the bare id otherwise; and `fallback` when there's no one (the admin password, a key, the bot).
import { VxTooltip } from '@vexoulz/ui'

defineProps<{ id?: string | null; login?: string | null; fallback?: string }>()
</script>

<template>
  <VxTooltip v-if="login && id" :text="`Twitch user id ${id}`">
    <span class="user" tabindex="0">@{{ login }}</span>
  </VxTooltip>
  <span v-else-if="login">@{{ login }}</span>
  <span v-else-if="id" class="user" :title="`Twitch user id ${id}; their login isn't known`">{{ id }}</span>
  <span v-else>{{ fallback ?? '' }}</span>
</template>

<style scoped>
.user { cursor: help; text-decoration: underline dotted color-mix(in srgb, currentColor 40%, transparent); text-underline-offset: 3px; }
</style>
