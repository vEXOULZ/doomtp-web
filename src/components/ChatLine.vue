<script setup lang="ts">
// Command text coloured by the bot's own lexer (lib/lexer.ts). Inline by default; `block` makes a code block with
// one line per entry. `context="body"` is a custom command's body, which has no command sign.
import { computed, onMounted } from 'vue'
import { type LexContext, loadLexer, spans, tokenizer } from '@/lib/lexer'

const props = withDefaults(defineProps<{ lines: string | string[]; sign: string; block?: boolean; context?: LexContext }>(), {
  block: false,
  context: 'line',
})
const rendered = computed(() =>
  (Array.isArray(props.lines) ? props.lines : [props.lines]).map((line) =>
    spans(line, tokenizer.value, { prefix: props.sign, context: props.context }),
  ),
)
onMounted(loadLexer)
</script>

<template>
  <pre v-if="block" class="vx-code dtb"><template v-for="(line, i) in rendered" :key="i"><template v-if="i">{{ '\n' }}</template><span v-for="(s, j) in line" :key="j" :class="s.cls">{{ s.text }}</span></template></pre>
  <code v-else class="dtb"><span v-for="(s, j) in rendered[0]" :key="j" :class="s.cls">{{ s.text }}</span></code>
</template>
