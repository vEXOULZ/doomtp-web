<script setup lang="ts">
// Every page's frame: the shared shell with dtp's nav, a "Manage" button in the header once someone is signed in
// (the Manage bar itself is on the Manage pages, ManageShell), an admin's "View as" banner while previewing, and the
// bot's version and default sign in the footer.
import { VxSiteFooter, VxSiteShell } from '@vexoulz/ui'
import type { NavItem } from '@vexoulz/ui'
import { useAccount } from '@vexoulz/ui/account'
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { bounceOnce, ensure, session } from '@/lib/session'
import { loadSite, site } from '@/lib/site'
import AccountMenu from './AccountMenu.vue'
import ManageLink from './ManageLink.vue'
import ViewAsBar from './ViewAsBar.vue'

withDefaults(defineProps<{ sky?: 'full' | 'dim' | 'off' }>(), { sky: 'full' })

const NAV: NavItem[] = [
  { label: 'Features', to: '/docs/features' },
  { label: 'Commands', to: '/docs/commands' },
  { label: 'Language', to: '/docs/language' },
  { label: 'API', to: '/docs/api' },
]

const account = useAccount()
const route = useRoute()

onMounted(() => {
  loadSite()
  ensure()
})
// Signed in to the vexoulz account but not to the bot: one trip through the bot's sign-in makes the session.
watch(
  () => [account.user.value, session.checked] as const,
  ([user, checked]) => {
    if (checked && !route.meta.public) bounceOnce(!!user, route.fullPath)
  },
  { immediate: true },
)
</script>

<template>
  <VxSiteShell site="dtp" :nav="NAV" :sky="sky">
    <template #actions><ManageLink v-if="session.authenticated" /></template>
    <template #account><AccountMenu /></template>
    <ViewAsBar />
    <slot></slot>
    <template #footer>
      <VxSiteFooter>
        <span v-if="site.info" class="meta">
          doomtp-bot {{ site.info.version }} · language {{ site.info.syntax_version }} · default sign
          <code>{{ site.info.default_prefix }}</code>
        </span>
      </VxSiteFooter>
    </template>
  </VxSiteShell>
</template>

<style scoped>
.meta { font-size: 12px; }
</style>
