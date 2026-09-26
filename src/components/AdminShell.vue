<script setup lang="ts">
// Frame for every signed-in admin page: the site shell with the admin nav and a sign-out button.
import { VxButton, VxSiteFooter, VxSiteShell, type NavItem } from '@vexoulz/ui'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logout } from '@/lib/session'

defineProps<{ title: string; eyebrow?: string }>()
const route = useRoute()
const router = useRouter()

const nav = computed<NavItem[]>(() => [
  { label: 'Overview', to: '/admin', current: route.path === '/admin' },
  { label: 'Explain', to: '/admin/explain', current: route.path === '/admin/explain' },
  { label: 'Audit', to: '/admin/audit', current: route.path === '/admin/audit' },
  { label: 'Site', to: '/' },
])

const leaving = ref(false)
async function signOut() {
  leaving.value = true
  try {
    await logout()
  } catch {
    // the session is dropped here either way
  } finally {
    leaving.value = false
    router.push('/admin/login')
  }
}
</script>

<template>
  <VxSiteShell site="dtp" :nav="nav" sky="dim">
    <template #account>
      <VxButton variant="ghost" :loading="leaving" @click="signOut">Sign out</VxButton>
    </template>
    <div class="head">
      <div class="vx-eyebrow">{{ eyebrow ?? 'Admin' }}</div>
      <h1 class="vx-display">{{ title }}</h1>
      <div v-if="$slots.actions" class="actions"><slot name="actions"></slot></div>
    </div>
    <slot></slot>
    <template #footer><VxSiteFooter /></template>
  </VxSiteShell>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 16px; margin-bottom: 20px; }
.head .vx-eyebrow { flex-basis: 100%; }
.head h1 { font-size: 28px; margin: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
