<script setup lang="ts">
// Inline code for something typed in chat: the command sign (the bot's default unless given) and the rest, coloured.
import { computed } from 'vue'
import { defaultSign } from '@/lib/site'
import ChatLine from './ChatLine.vue'

const props = defineProps<{ t: string; sign?: string }>()
const sign = computed(() => props.sign ?? defaultSign())
</script>

<template>
  <ChatLine :lines="`${sign}${t}`" :sign="sign" />
</template>
