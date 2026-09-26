<script setup lang="ts">
import { VxButton, VxCallout, VxField, VxInput } from '@vexoulz/ui'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DtpShell from '@/components/DtpShell.vue'
import { ApiError } from '@/lib/api'
import { ensure, login, session } from '@/lib/session'

const route = useRoute()
const router = useRouter()
const password = ref('')
const field = ref<{ focus: () => void } | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

const next = computed(() => {
  const n = route.query.next
  // Only paths inside the admin area: never an absolute URL from the query.
  return typeof n === 'string' && n.startsWith('/admin') && !n.startsWith('//') ? n : '/admin'
})

onMounted(async () => {
  await ensure()
  if (session.authenticated) router.replace(next.value)
  else field.value?.focus()
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
    else error.value = `Couldn't reach the bot${e instanceof Error ? ` (${e.message})` : ''}.`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <DtpShell>
    <form class="login vx-panel" @submit.prevent="submit">
      <div class="vx-eyebrow">dtp.vexoulz.net</div>
      <h1 class="vx-display">Admin</h1>
      <VxCallout v-if="session.notice && !error" tone="warn">{{ session.notice }}</VxCallout>
      <VxCallout v-if="session.checked && !session.enabled" tone="warn" title="Sign-in is off">
        The bot has no admin password set (<code>ADMIN_PASSWORD_FILE</code> or <code>ADMIN_PASSWORD</code>).
      </VxCallout>
      <VxField label="Password" :error="error ?? undefined">
        <template #default="{ id }">
          <VxInput :id="id" ref="field" v-model="password" type="password" :invalid="!!error" />
        </template>
      </VxField>
      <VxButton type="submit" variant="primary" :loading="busy" :disabled="!password">Sign in</VxButton>
    </form>
  </DtpShell>
</template>

<style scoped>
.login { display: flex; flex-direction: column; gap: 14px; width: min(360px, 100%); margin: 8vh auto 0; padding: 24px; box-sizing: border-box; }
.login h1 { font-size: 28px; margin: 0 0 4px; }
.login :deep(input) { width: 100%; }
</style>
