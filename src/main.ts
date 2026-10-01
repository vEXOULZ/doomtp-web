import '@vexoulz/ui/fonts.css'
import '@vexoulz/ui/style.css'
import '@vexoulz/platform-web/style.css'
import './styles.css'
import './styles/platform.css'

import { createPlatformUi } from '@vexoulz/platform-web/vue'
import { VxBuild, useToast } from '@vexoulz/ui'
import { createApp } from 'vue'
import { createRouter, createWebHistory, RouterLink } from 'vue-router'

import App from './App.vue'
import { isAdmin } from './lib/access'
import { account } from './lib/account'
import { hashPosition } from './lib/hash'
import { ensure, previewing, realSession as session, setExpiredHandler, twitchLoginUrl } from './lib/session'

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
    // Manage. Every page needs a session (see src/lib/session.ts); what each shows depends on its rank.
    { path: '/manage', component: () => import('./pages/manage/OverviewPage.vue') },
    { path: '/manage/me', component: () => import('./pages/manage/MePage.vue') },
    { path: '/manage/channels/:login', component: () => import('./pages/manage/ChannelPage.vue'), props: true },
    { path: '/manage/explain', component: () => import('./pages/manage/ExplainPage.vue') },
    { path: '/manage/jobs', component: () => import('./pages/manage/JobsPage.vue') },
    { path: '/manage/jobs/:id(\\d+)', component: () => import('./pages/manage/JobPage.vue'), props: true },
    { path: '/manage/audit', component: () => import('./pages/manage/AuditPage.vue') },
    { path: '/manage/bot', component: () => import('./pages/manage/BotPage.vue') },
    // The sign-in page: the bot's Twitch sign-in lands here with ?error=, and the admin password lives here.
    { path: '/admin/login', component: () => import('./pages/admin/AdminLoginPage.vue'), meta: { public: true } },
    // The old admin area, for links and bookmarks already out there.
    { path: '/admin/:rest(.*)*', redirect: (to) => ({ path: `/manage${to.path.slice('/admin'.length)}`, query: to.query, hash: to.hash }) },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved
    // Anchors (#grammar, #variables): a page that renders after its data loads is scrolled by useLoad instead.
    if (to.hash) return hashPosition(to.hash)
    return to.path !== from.path ? { top: 0 } : undefined
  },
})

// A session that ends mid-use sends the visitor to the sign-in page, which says why and brings them back.
setExpiredHandler(() => {
  const here = router.currentRoute.value
  if (here.path.startsWith('/manage')) router.push({ path: '/admin/login', query: { next: here.fullPath } })
})

// Manage pages need a session. Signed out, the visitor goes through the bot's Twitch sign-in (which, with the vexoulz
// account as its provider, is the account sign-in) and comes back to the page; without it, to the password page.
router.beforeEach(async (to) => {
  if (!to.path.startsWith('/manage')) return true
  await ensure()
  // An admin viewing the site as someone signed out gets what they would: no Manage pages.
  if (previewing()?.role === 'signed-out') return '/'
  if (session.authenticated) return true
  if (session.twitchLogin && !session.notice) {
    window.location.assign(twitchLoginUrl(to.fullPath))
    return false
  }
  return { path: '/admin/login', query: { next: to.fullPath } }
})

createApp(App)
  .use(router)
  .use(VxBuild, { commit: __COMMIT__ })
  .use(account)
  // The shared jobs and audit components: where a job lives (its page is for admins), and toasts.
  .use(
    createPlatformUi({
      link: RouterLink,
      jobHref: (id) => (isAdmin() ? `/manage/jobs/${id}` : null),
      subjectHref: (s) => {
        const job = /^job:(\d+)$/.exec(s)
        return job && isAdmin() ? `/manage/jobs/${job[1]}` : null
      },
      notify: (msg, kind) => useToast().show(msg, { kind, duration: kind === 'error' ? 5000 : 3000 }),
      appName: 'bot',
    }),
  )
  .mount('#app')
