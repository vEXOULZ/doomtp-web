<script setup lang="ts">
// Explain and sandbox for anyone signed in: what an expression would do in any channel, and optionally run it with
// nothing sent or saved. Checking it as a chatter you name (architecture §11 `as_user`) is for the channel's
// moderators, as the bot allows it.
import { VxButton, VxCallout, VxCheckbox, VxField, VxInput, VxSelect, VxSkeleton } from '@vexoulz/ui'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ManageShell from '@/components/ManageShell.vue'
import ExplainReport from '@/components/ExplainReport.vue'
import { can } from '@/lib/access'
import { admin, EXPLAIN_BADGES } from '@/lib/admin'
import { api, errorMessage, type ExplainReport as Report } from '@/lib/api'
import { useLoad } from '@/lib/useLoad'

const route = useRoute()
const router = useRouter()
const { data: channels, error: loadError, reload } = useLoad(async () => (await api.site()).channels)

const form = reactive({
  channel: typeof route.query.channel === 'string' ? route.query.channel : '',
  text: '',
  as_user: '',
  badges: [] as string[],
  run: false,
})
watch(channels, (list) => {
  if (list?.length && !list.some((c) => c.login === form.channel)) form.channel = list[0]!.login
})
const options = computed(() => (channels.value ?? []).map((c) => ({ value: c.login, label: `#${c.login}`, sub: c.prefix })))
const sign = computed(() => channels.value?.find((c) => c.login === form.channel)?.prefix ?? '!')
/** Whether this channel lets the session check as someone else: its moderators and up. */
const asOthers = computed(() => !!form.channel && can('explain.as', form.channel))

const badge = (name: string) => ({
  get: () => form.badges.includes(name),
  set: (on: boolean) => (form.badges = on ? [...form.badges, name] : form.badges.filter((b) => b !== name)),
})
const badgeModels = EXPLAIN_BADGES.map((name) => ({ name, model: computed(badge(name)) }))

const busy = ref(false)
const error = ref<string | null>(null)
const report = ref<Report | null>(null)
const checkedAs = ref('')
async function submit() {
  if (!form.text.trim() || !form.channel) return
  busy.value = true
  error.value = null
  try {
    report.value = await admin.explainAs({
      text: form.text,
      channel: form.channel,
      as_user: (asOthers.value && form.as_user.trim()) || undefined,
      badges: asOthers.value ? form.badges : [],
      run: form.run,
    })
    checkedAs.value = asOthers.value ? form.as_user.trim() : ''
    router.replace({ query: { channel: form.channel } })
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ManageShell title="Explain">
    <p class="vx-muted intro">
      What an expression would do in a channel. <b>Run</b> evaluates it too, with variable writes discarded,
      cooldowns untouched and nothing sent. In a channel you moderate you can also check it as a chatter you name:
      chat badges (moderator, VIP, subscriber) only arrive with a chat message, so tick the ones to assume; custom
      roles, the broadcaster and bot admins are looked up as in chat.
    </p>
    <VxCallout v-if="loadError" tone="error" title="Couldn't load the channels">
      {{ loadError }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <VxSkeleton v-else-if="!channels" h="160px" />
    <form v-else class="form vx-panel" @submit.prevent="submit">
      <div class="line">
        <VxField label="Channel">
          <template #default="{ id }"><VxSelect :id="id" v-model="form.channel" :options="options" width="220px" /></template>
        </VxField>
        <VxField label="Expression" class="grow">
          <template #default="{ id }">
            <VxInput :id="id" v-model="form.text" mono :placeholder="`${sign}random 1-6 | echo you rolled {_1}`" />
          </template>
        </VxField>
      </div>
      <div v-if="asOthers" class="line">
        <VxField label="As chatter" help="A Twitch login. Empty: nobody in particular.">
          <template #default="{ id }"><VxInput :id="id" v-model="form.as_user" placeholder="login" mono /></template>
        </VxField>
        <fieldset class="badges">
          <legend class="vx-field-label">Badges to assume</legend>
          <VxCheckbox v-for="b in badgeModels" :key="b.name" v-model="b.model.value" :label="b.name" />
        </fieldset>
      </div>
      <div class="line end">
        <VxCheckbox v-model="form.run" label="Run it too (nothing is sent or saved)" />
        <span class="spacer"></span>
        <VxButton type="submit" variant="primary" :loading="busy" :disabled="!form.text.trim()">Explain</VxButton>
      </div>
    </form>

    <VxCallout v-if="error" tone="error" title="Couldn't explain that" class="result">{{ error }}</VxCallout>
    <section v-else-if="report" class="result doc">
      <p v-if="checkedAs" class="vx-muted">Checked as <b>{{ checkedAs }}</b>.</p>
      <ExplainReport :report="report" />
    </section>
  </ManageShell>
</template>

<style scoped>
.intro { margin: 0 0 14px; max-width: 52rem; }
.form { display: grid; gap: 14px; padding: 16px; }
.line { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-start; }
.line.end { align-items: center; }
.grow { flex: 1 1 20rem; }
.badges { display: flex; flex-wrap: wrap; gap: 6px 14px; border: 0; padding: 0; margin: 0; }
.badges legend { padding: 0; margin-bottom: 6px; width: 100%; }
.spacer { flex: 1; }
.result { margin-top: 20px; }
</style>
