<script setup lang="ts">
// The "By" cell of the shared audit table, the bot's way: a Twitch user as @login with their id in a tooltip, the
// admin password, a key and the bot itself by name.
import type { AuditOut } from '@vexoulz/platform-web'
import { nobody } from '@/lib/platform'
import UserRef from './UserRef.vue'

defineProps<{ entry: AuditOut }>()
const userId = (e: AuditOut) => (e.actor_kind === 'user' ? e.actor_id : null)
</script>

<template>
  <UserRef :id="userId(entry)" :login="userId(entry) ? entry.actor_login : null" :fallback="nobody(entry)" />
</template>
