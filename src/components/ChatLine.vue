<script setup lang="ts">
// Chat lines, coloured like the lab's code blocks. `block` makes a code block of one line per entry.
import { computed } from 'vue'
import { highlight } from '@/lib/highlight'
import Emoji from './Emoji.vue'

const props = withDefaults(defineProps<{ lines: string | string[]; sign: string; block?: boolean }>(), { block: false })
const tokenized = computed(() => (Array.isArray(props.lines) ? props.lines : [props.lines]).map((l) => highlight(l, props.sign)))
</script>

<template>
  <pre v-if="block" class="vx-code"><template v-for="(tokens, i) in tokenized" :key="i"><template v-if="i">{{ '\n' }}</template><span v-for="(t, j) in tokens" :key="j" :class="t.kind === 'text' ? undefined : `vx-tok-${t.kind}`"><Emoji :text="t.text" /></span></template></pre>
  <code v-else class="line"><template v-for="(tokens, i) in tokenized" :key="i"><span v-for="(t, j) in tokens" :key="j" :class="t.kind === 'text' ? undefined : `vx-tok-${t.kind}`"><Emoji :text="t.text" /></span></template></code>
</template>

<style scoped>
.line { font-family: var(--vx-font-mono); font-size: 0.9em; }
</style>
