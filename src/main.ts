import '@vexoulz/ui/fonts.css'
import '@vexoulz/ui/style.css'
import './styles.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'
import { ensure, session, setExpiredHandler } from './lib/session'

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
    // Anchors (#grammar, #variables): the page renders after its data loads, so give it a moment.
    if (to.hash) return new Promise((resolve) => setTimeout(() => resolve({ el: to.hash, top: 64 }), 300))
    return to.path !== from.path ? { top: 0 } : undefined
  },
})

router.beforeEach(async (to) => {
  if (!to.path.startsWith('/admin') || to.meta.public) return true
  await ensure()
  return session.authenticated || { path: '/admin/login', query: { next: to.fullPath } }
})
setExpiredHandler(() => {
  const here = router.currentRoute.value
  if (here.path.startsWith('/admin') && !here.meta.public) router.push({ path: '/admin/login', query: { next: here.fullPath } })
})

createApp(App).use(router).mount('#app')
