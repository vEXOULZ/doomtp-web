<script setup lang="ts">
import { VxButton, VxCallout, VxChip, VxSkeleton } from '@vexoulz/ui'
import { computed } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import Cmd from '@/components/Cmd.vue'
import DtpShell from '@/components/DtpShell.vue'
import { defaultSign, loadSite, site } from '@/lib/site'

const sign = computed(defaultSign)
const tries = computed(() => [`${sign.value}ping`, `${sign.value}random 1-100 | echo you rolled {_1}!`, `${sign.value}help`])

const START = [
  { to: '/docs/features', title: 'Features', text: 'Every part of the bot: permissions, cooldowns, custom commands, packs, variables, triggers, timers, the word filter, logging and the API.' },
  { to: '/docs/commands', title: 'Command reference', text: 'Every built-in command with its arguments, examples, required role and cooldowns.' },
  { to: '/docs/language', title: 'Language reference', text: 'Operators, placeholders, types and the grammar, with the limits that apply, and an editor to try a line in.' },
  { to: '/docs/api', title: 'API', text: 'Every endpoint of /api/v1: parse, explain, language, commands and the rest.' },
]
</script>

<template>
  <DtpShell>
    <div class="hero">
      <div>
        <div class="vx-eyebrow">doomtp-bot<template v-if="site.info"> · v{{ site.info.version }}</template></div>
        <h1 class="vx-display">A Twitch chat bot with a composable command language.</h1>
        <p class="vx-muted lead">
          Commands pipe into each other, anyone can build new ones from the pieces, and every message is logged and
          searchable.
        </p>
      </div>
      <div class="try vx-panel">
        <div class="vx-eyebrow">Try it in chat</div>
        <ChatLine :lines="tries" :sign="sign" block />
        <p class="vx-muted small">
          The command sign is <code>{{ sign }}</code> by default, and a space after it is fine:
          <Cmd t=" ping" :sign="sign" /> works too. Each channel can pick its own with
          <Cmd t="prefix" :sign="sign" />.
        </p>
      </div>
    </div>

    <h2 class="vx-display sec">Where to start</h2>
    <div class="cards">
      <RouterLink v-for="c in START" :key="c.title" :to="c.to" class="card vx-panel">
        <b>{{ c.title }}</b>
        <span class="vx-muted small">{{ c.text }}</span>
      </RouterLink>
    </div>

    <h2 class="vx-display sec">Channels</h2>
    <VxCallout v-if="site.error" tone="error" title="Couldn't load the channels">
      {{ site.error }}
      <template #actions><VxButton size="sm" @click="loadSite">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!site.info" class="cards" aria-busy="true">
      <VxSkeleton v-for="i in 3" :key="i" h="64px" />
    </div>
    <p v-else-if="!site.info.channels.length" class="vx-muted">
      The bot hasn't joined any channels yet. A broadcaster can type <Cmd t="join" :sign="sign" /> in
      the bot's own chat.
    </p>
    <div v-else class="cards">
      <RouterLink v-for="ch in site.info.channels" :key="ch.login" :to="`/channels/${ch.login}`" class="card chan vx-panel">
        <div class="chan-top"><b>#{{ ch.login }}</b><VxChip tone="ok">joined</VxChip></div>
        <div class="vx-muted small vx-mono">sign <code>{{ ch.prefix }}</code> · {{ ch.tier }} tier</div>
      </RouterLink>
    </div>
  </DtpShell>
</template>

<style scoped>
.hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 28px; align-items: center; }
.hero h1 { font-size: 30px; margin: 8px 0 12px; }
.lead { max-width: 34rem; margin: 0; }
.try { padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.try p { margin: 0; }
.sec { font-size: 22px; margin: 36px 0 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.card { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; color: inherit; }
.card:hover { border-color: var(--vx-accent); color: inherit; }
.card b { color: var(--vx-ink); }
.chan-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.small { font-size: 12px; }
code { font-family: var(--vx-font-mono); }
@container vx-site (max-width: 700px) {
  .hero { grid-template-columns: 1fr; }
}
</style>
