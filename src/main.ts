import '@vexoulz/ui/fonts.css'
import '@vexoulz/ui/style.css'
import './styles.css'

import { VxBuild } from '@vexoulz/ui'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'
import { account } from './lib/account'
import { hashPosition } from './lib/hash'

// The same URLs as the bot's own pages, so links already out there (chat's explain links included) keep working.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/HomePage.vue') },
    { path: '/docs/features', component: () => import('./pages/FeaturesPage.vue') },
    { path: '/docs/commands', component: () => import('./pages/CommandsPage.vue') },
    { path: '/docs/language', component: () => import('./pages/LanguagePage.vue') },
    { path: '/docs/api', component: () => import('./pages/ApiPage.vue') },
    { path: '/channels/:login', component: () => import('./pages/ChannelPage.vue'), props: true },
    { path: '/explain/:token', component: () => import('./pages/ExplainPage.vue'), props: true },
    // Admin. Every page but the sign-in needs a session; see src/lib/session.ts.
    { path: '/admin/login', component: () => import('./pages/admin/AdminLoginPage.vue'), meta: { public: true } },
    { path: '/admin', component: () => import('./pages/admin/AdminOverviewPage.vue') },
    { path: '/admin/channels/:login', component: () => import('./pages/admin/AdminChannelPage.vue'), props: true },
    { path: '/admin/explain', component: () => import('./pages/admin/AdminExplainPage.vue') },
    { path: '/admin/audit', component: () => import('./pages/admin/AdminAuditPage.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved
    // Anchors (#grammar, #variables): a page that renders after its data loads is scrolled by useLoad instead.
    if (to.hash) return hashPosition(to.hash)
    return to.path !== from.path ? { top: 0 } : undefined
  },
})

// The admin session (and the admin client behind it) loads with the first admin page, not for every visitor.
let sessionModule: Promise<typeof import('./lib/session')> | undefined
const loadSession = () =>
  (sessionModule ??= import('./lib/session').then((m) => {
    m.setExpiredHandler(() => {
      const here = router.currentRoute.value
      if (here.path.startsWith('/admin') && !here.meta.public) router.push({ path: '/admin/login', query: { next: here.fullPath } })
    })
    return m
  }))

router.beforeEach(async (to) => {
  if (!to.path.startsWith('/admin') || to.meta.public) return true
  const { ensure, session } = await loadSession()
  await ensure()
  return session.authenticated || { path: '/admin/login', query: { next: to.fullPath } }
})

createApp(App).use(router).use(VxBuild, { commit: __COMMIT__ }).use(account).mount('#app')
