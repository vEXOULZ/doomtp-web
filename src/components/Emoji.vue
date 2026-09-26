<script setup lang="ts">
// Text with the bot's emoji drawn as images (see lib/emoji.ts).
import { computed } from 'vue'
import { emojiPieces } from '@/lib/emoji'

const props = defineProps<{ text: string }>()
const pieces = computed(() => emojiPieces(props.text))
</script>

<template>
  <template v-for="(p, i) in pieces" :key="i"><img v-if="'emoji' in p" class="emoji" :src="p.src" :alt="p.emoji" draggable="false" /><template v-else>{{ p.text }}</template></template>
</template>

<style scoped>
.emoji { height: 1.1em; width: 1.1em; vertical-align: -0.15em; display: inline-block; }
</style>
