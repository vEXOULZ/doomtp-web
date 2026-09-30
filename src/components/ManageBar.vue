<script setup lang="ts">
// The Manage bar: at the top of the Manage pages (ManageShell), with what the person signed in may manage. A channel
// switcher for the channels they run, their own area, Explain and Audit, and the bot's own page for admins.
// On a narrow screen it wraps; nothing is dropped.
import { VxSelect } from '@vexoulz/ui'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { can, isAdmin } from '@/lib/access'
import { session } from '@/lib/session'
import { site } from '@/lib/site'

const route = useRoute()
const router = useRouter()

const LINKS = computed(() => [
  { label: 'Overview', to: '/manage', exact: true },
  { label: 'Me', to: '/manage/me' },
  { label: 'Explain', to: '/manage/explain' },
  { label: 'Audit', to: '/manage/audit' },
  ...(can('bot') ? [{ label: 'Bot', to: '/manage/bot' }] : []),
])
const current = (to: string, exact = false) => (exact ? route.path === to : route.path === to || route.path.startsWith(`${to}/`))

/** The channels to switch between: an admin's are every channel the bot knows. */
const channels = computed(() => {
  const logins = isAdmin() ? (site.info?.channels ?? []).map((c) => c.login) : [...(session.channels ?? [])]
  return logins.sort().map((login) => ({
    value: login,
    label: `#${login}`,
    sub: session.channelRoles?.[login] === 'broadcaster' ? 'yours' : undefined,
  }))
})
const channel = computed(() => {
  const m = /^\/manage\/channels\/([^/]+)/.exec(route.path)
  return m ? decodeURIComponent(m[1]!) : undefined
})
function open(login: string | undefined) {
  if (login && login !== channel.value) router.push(`/manage/channels/${encodeURIComponent(login)}`)
}

const who = computed(() => {
  if (!session.user) return 'admin'
  const role = session.role === 'admin' ? 'bot admin' : null
  return role ? `@${session.user.login} · ${role}` : `@${session.user.login}`
})
</script>

<template>
  <nav class="manage vx-panel" aria-label="Manage">
    <span class="vx-eyebrow label">Manage</span>
    <VxSelect
      v-if="channels.length"
      :model-value="channel"
      :options="channels"
      placeholder="Channel…"
      size="sm"
      width="190px"
      aria-label="Channel to manage"
      @update:model-value="open"
    />
    <div class="links">
      <RouterLink
        v-for="l in LINKS"
        :key="l.to"
        :to="l.to"
        class="link"
        :class="{ 'is-current': current(l.to, l.exact) }"
        :aria-current="current(l.to, l.exact) ? 'page' : undefined"
      >{{ l.label }}</RouterLink>
    </div>
    <span class="who vx-muted vx-mono">{{ who }}</span>
  </nav>
</template>

<style scoped>
.manage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 8px 12px;
  margin: 0 0 20px;
}
.label { margin: 0; }
.links { display: flex; flex-wrap: wrap; gap: 2px; }
.link {
  padding: 5px 10px;
  border-radius: var(--vx-radius-sm);
  color: var(--vx-muted);
  text-decoration: none;
  font-size: 13px;
}
.link:hover { color: var(--vx-ink); background: var(--vx-hover); }
.link.is-current { color: var(--vx-accent); background: var(--vx-hover); }
.who { margin-left: auto; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
</style>
