import '@vexoulz/ui/fonts.css'
import '@vexoulz/ui/style.css'
import './styles.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'

// The same URLs as the bot's own pages, so links already out there (chat's explain links included) keep working.
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/HomePage.vue') },
    { path: '/docs/features', component: () => import('./pages/FeaturesPage.vue') },
    { path: '/docs/commands', component: () => import('./pages/CommandsPage.vue') },
    { path: '/docs/language', component: () => import('./pages/LanguagePage.vue') },
    { path: '/channels/:login', component: () => import('./pages/ChannelPage.vue'), props: true },
    { path: '/explain/:token', component: () => import('./pages/ExplainPage.vue'), props: true },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved
    // Anchors (#grammar, #variables): the page renders after its data loads, so give it a moment.
    if (to.hash) return new Promise((resolve) => setTimeout(() => resolve({ el: to.hash, top: 64 }), 300))
    return to.path !== from.path ? { top: 0 } : undefined
  },
})

createApp(App).use(router).mount('#app')
