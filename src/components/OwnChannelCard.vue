<script setup lang="ts">
// The user's own channel: add the bot to it (at once: signing in with Twitch proved it's theirs), or, once it's
// there on less than the full tier, reconnect to grant the bot the rest; or why it can't, when the channel banned
// it. Shows nothing otherwise.
import { VxButton, VxCallout, useToast } from '@vexoulz/ui'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { mayAddOwn, mayUpgrade, ownBanned } from '@/lib/access'
import { errorText } from '@vexoulz/platform-web'
import { CONNECT_URL, joinOwnChannel, session } from '@/lib/session'

const toast = useToast()
const router = useRouter()
const busy = ref(false)
const error = ref<string | null>(null)

async function add() {
  const login = session.ownChannel?.login
  if (!login || busy.value) return
  busy.value = true
  error.value = null
  try {
    await joinOwnChannel()
    toast.show(`The bot joined #${login}`)
    router.push(`/manage/channels/${encodeURIComponent(login)}`)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <VxCallout v-if="mayAddOwn()" tone="info" :title="`Add doomtp-bot to #${session.ownChannel!.login}`" class="own">
    The bot joins your channel straight away, as <code>join</code> does in chat, and you manage it from here. It
    starts on the basic tier. Making it a moderator in your channel adds the moderator tools, and connecting your
    channel lets it use channel points, subs, bits, raids and the stream's title.
    <p v-if="error" class="err">{{ error }}</p>
    <template #actions>
      <VxButton variant="primary" size="sm" :loading="busy" @click="add">Add the bot to my channel</VxButton>
    </template>
  </VxCallout>
  <VxCallout v-else-if="ownBanned()" tone="warn" :title="`#${session.ownChannel!.login} banned the bot`" class="own">
    The bot left your channel when it was banned there, and only a bot admin can bring it back. Unban it in your
    channel first, then ask for a rejoin.
  </VxCallout>
  <VxCallout
    v-else-if="mayUpgrade()"
    tone="info"
    :title="`#${session.ownChannel!.login} is on the ${session.ownChannel!.tier} tier`"
    class="own"
  >
    Connect your channel to let the bot use channel points, subs, bits, raids and the stream's title. Twitch asks you
    to confirm what it gets, and you can grant only part of it.
    <template #actions><VxButton :href="CONNECT_URL" size="sm" variant="primary">Upgrade to the full tier</VxButton></template>
  </VxCallout>
</template>

<style scoped>
.own { margin-bottom: 20px; }
.err { color: var(--vx-bad); margin: 8px 0 0; }
</style>
