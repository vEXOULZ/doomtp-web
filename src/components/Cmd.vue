<script setup lang="ts">
// Inline code for something typed in chat: the command sign (the bot's default unless given) and the rest.
import { computed } from 'vue'
import { defaultSign } from '@/lib/site'
import Emoji from './Emoji.vue'

const props = defineProps<{ t: string; sign?: string }>()
const text = computed(() => `${props.sign ?? defaultSign()}${props.t}`)
</script>

<template>
  <code><Emoji :text="text" /></code>
</template>
