<script setup lang="ts">
import { VxButton, VxCallout, VxField, VxInput, VxTwitchGlyph } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DtpShell from '@/components/DtpShell.vue'
import { ApiError } from '@/lib/api'
import { ensure, login, realSession as session, SIGNIN_ERRORS, twitchLoginUrl } from '@/lib/session'

const route = useRoute()
const router = useRouter()
const password = ref('')
const field = ref<{ focus: () => void } | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

const next = computed(() => {
  const n = route.query.next
  // Only paths on this site: never an absolute URL from the query.
  return typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') && !n.startsWith('/admin/login') ? n : '/manage'
})

/** A failed Twitch sign-in, as the bot's callback reports it. */
const signinError = computed(() => {
  const e = route.query.error
  if (typeof e !== 'string' || !e) return null
  return SIGNIN_ERRORS[e] ?? `Signing in with Twitch failed (${e}).`
})
const offered = computed(() => session.enabled || session.twitchLogin)

onMounted(async () => {
  await ensure()
  if (session.authenticated) router.replace(next.value)
  else if (!session.twitchLogin) field.value?.focus()
})

async function submit() {
  if (!password.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await login(password.value)
    password.value = ''
    router.replace(next.value)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) error.value = 'Wrong password.'
    else if (e instanceof ApiError && e.status === 429)
      error.value = `Too many attempts. Try again in ${e.retryAfter ? `${Math.ceil(e.retryAfter / 60)} min` : 'a few minutes'}.`
    else if (e instanceof ApiError && e.status === 404) error.value = 'The bot has no admin password set.'
    else if (e instanceof ApiError && e.status === 403)
      error.value = "The admin password only works from the bot's local network. Sign in with Twitch instead."
    else error.value = `Couldn't reach the bot${e instanceof Error ? ` (${e.message})` : ''}.`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <DtpShell>
    <form class="login vx-panel" @submit.prevent="submit">
      <div class="vx-eyebrow">dtp.vexoul.net</div>
      <h1 class="vx-display">Sign in</h1>
      <VxCallout v-if="signinError" tone="error">{{ signinError }}</VxCallout>
      <VxCallout v-else-if="session.notice && !error" tone="warn">{{ session.notice }}</VxCallout>
      <VxCallout v-if="session.checked && !offered" tone="warn" title="Sign-in is off">
        Twitch sign-in isn't set up on the bot, and the admin password isn't offered here: either none is set
        (<code>ADMIN_PASSWORD</code>), or this address is outside the networks it works from
        (<code>ADMIN_PASSWORD_NETWORKS</code>, the bot's local network by default).
      </VxCallout>
      <template v-if="session.twitchLogin">
        <VxButton :href="twitchLoginUrl(next)" variant="primary" class="twitch"><VxTwitchGlyph />Sign in with Twitch</VxButton>
        <p class="vx-muted note">Anyone with a Twitch account: manage your commands, and the channels you run.</p>
        <div v-if="session.enabled" class="or vx-muted" role="separator">or with the admin password</div>
      </template>
      <template v-if="session.enabled">
        <VxField label="Password" :error="error ?? undefined">
          <template #default="{ id }">
            <VxInput :id="id" ref="field" v-model="password" type="password" :invalid="!!error" />
          </template>
        </VxField>
        <VxButton type="submit" :variant="session.twitchLogin ? 'default' : 'primary'" :loading="busy" :disabled="!password">Sign in</VxButton>
      </template>
    </form>
  </DtpShell>
</template>

<style scoped>
.login { display: flex; flex-direction: column; gap: 14px; width: min(360px, 100%); margin: 8vh auto 0; padding: 24px; box-sizing: border-box; }
.login h1 { font-size: 28px; margin: 0 0 4px; }
.twitch { width: 100%; justify-content: center; gap: 8px; }
.note { margin: -6px 0 0; font-size: 12px; }
.or { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--vx-line); }
</style>
