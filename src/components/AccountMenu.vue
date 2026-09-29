<script setup lang="ts">
// The header's account control. One sign-in: when the bot offers Twitch sign-in, "Sign in" goes through the bot,
// which (with the vexoulz account as its provider, ADR-0023) signs in to the account and makes the bot session in
// one trip. Otherwise it's the shared account alone (src/lib/account.ts). Signing out ends both. It goes by the real
// session, so an admin viewing the site as someone else still sees themselves here, and "View as…".
import { VxAccountMenu, VxMenuItem } from '@vexoulz/ui'
import type { AccountUser } from '@vexoulz/ui'
import { useAccount } from '@vexoulz/ui/account'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logout, mayViewAs, realSession as session, twitchLoginUrl } from '@/lib/session'
import { picker } from '@/lib/viewAs'

const account = useAccount()
const route = useRoute()
const router = useRouter()

/** The account's user, or the bot session's when only that one is signed in (the admin password has no user). */
const user = computed<AccountUser | null>(() => {
  if (account.menuUser.value) return account.menuUser.value
  if (!session.authenticated) return null
  return { name: session.user?.login ?? 'admin' }
})
const note = computed(() => {
  if (!session.authenticated) return undefined
  if (session.role === 'admin' || session.role === null) return 'bot admin'
  return account.menuUser.value ? undefined : 'signed in to doomtp-bot'
})

function signIn() {
  if (session.twitchLogin) window.location.assign(twitchLoginUrl(route.fullPath))
  else account.signIn()
}

async function signOut() {
  try {
    if (session.authenticated) await logout()
  } catch {
    // the session is dropped here either way
  }
  if (account.user.value) await account.signOut({ everywhere: true })
  if (route.path.startsWith('/manage')) router.push('/')
}
</script>

<template>
  <VxAccountMenu
    :user="user"
    :note="note"
    :disabled="!account.enabled && !session.twitchLogin"
    @sign-in="signIn"
    @sign-out="signOut"
  >
    <template #default="{ close }">
      <VxMenuItem v-if="session.authenticated" to="/manage/me" @click="close()">Your commands &amp; channel</VxMenuItem>
      <VxMenuItem v-if="mayViewAs()" @click="close(); picker.open = true">View as…</VxMenuItem>
      <slot :close="close"></slot>
    </template>
  </VxAccountMenu>
</template>
