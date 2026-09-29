<script setup lang="ts">
// Every page's frame: the shared shell with dtp's nav, and the bot's version and default sign in the footer.
import { VxSiteFooter, VxSiteShell } from '@vexoulz/ui'
import type { NavItem } from '@vexoulz/ui'
import { onMounted } from 'vue'
import { loadSite, site } from '@/lib/site'
import AccountMenu from './AccountMenu.vue'

const NAV: NavItem[] = [
  { label: 'Features', to: '/docs/features' },
  { label: 'Commands', to: '/docs/commands' },
  { label: 'Language', to: '/docs/language' },
  { label: 'API', to: '/docs/api' },
]

onMounted(loadSite)
</script>

<template>
  <VxSiteShell site="dtp" :nav="NAV">
    <template #account><AccountMenu /></template>
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
