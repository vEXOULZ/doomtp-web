<script setup lang="ts">
// The custom commands chat can run in a channel. One published on its own turns on and off here, as `cc
// enable|disable` does in chat, and one in a pack follows the pack (the Modules tab). Whoever reaches the channel's
// "publish" role publishes their own commands and packs here, or a pack someone shared, and takes them down again;
// whoever reaches its "grant" role lets published commands write the channel's variables.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSegmented, VxSelect, VxSwitch, useToast } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useResource } from '@vexoulz/ui/utils'
import ChatLine from '@/components/ChatLine.vue'
import { reachesRole } from '@/lib/access'
import { admin, type Grant } from '@/lib/admin'
import { errorText } from '@vexoulz/platform-web'
import { type Pack, type Role } from '@/lib/api'
import { CUSTOM_MODULE, type PublishedRow } from '@/lib/modules'
import { session } from '@/lib/session'
import { useAct } from '@/lib/useAct'
import { loginOf } from '@/lib/format'

const props = defineProps<{
  login: string
  sign: string
  published: PublishedRow[]
  packs: Pack[]
  /** The channel's `publish_min_role` and `grant_min_role`. */
  publishRole: string
  grantRole: string
  roles: Role[]
  reload: () => Promise<void>
}>()
const route = useRoute()
const toast = useToast()

const mayPublish = computed(() => reachesRole(props.login, props.publishRole, props.roles))
const mayGrant = computed(() => reachesRole(props.login, props.grantRole, props.roles))
/** Publishing names the publisher, so it takes a Twitch sign-in (not the admin password). */
const hasUser = computed(() => !!session.user)

const grants = useResource(async () => (await admin.grants(props.login)).grants, { source: () => props.login })
const reloadAll = async () => {
  await Promise.all([props.reload(), grants.reload()])
}
const { busy, act } = useAct(reloadAll)

const toggleable = (p: PublishedRow) => p.module === CUSTOM_MODULE && (p.status === 'active' || p.status === 'disabled')
const toggle = (p: PublishedRow, on: boolean) =>
  act(`p:${p.name}`, () => admin.setPublication(props.login, p.name, on), `${props.sign}${p.name} turned ${on ? 'on' : 'off'}`)
const channelPacks = computed(() => props.packs.filter((p) => p.scope === 'channel'))
const packOwner = (p: Pack) => {
  const owner = p.commands[0]?.owner
  return owner && owner !== session.user?.login ? owner : undefined
}

// ── publishing: one of your commands (or aliases), your pack, or a pack someone shared ──
const mine = useResource(async () => {
  if (!session.user) return { commands: [], packs: [] }
  const [commands, packs] = await Promise.all([admin.myCommands(), admin.myPacks()])
  return {
    commands: [...commands.commands.map((c) => c.name), ...commands.linked.map((l) => l.alias)].sort(),
    packs: packs.packs.filter((p) => !p.system).map((p) => p.name),
  }
})
const pub = reactive({ open: false, what: 'command', command: '', as: '', pack: '', owner: '' })
function openPublish() {
  Object.assign(pub, { open: true, what: 'command', command: '', as: '', pack: '', owner: '' })
  void mine.reload()
}
const WHAT = [
  { value: 'command', label: 'A command' },
  { value: 'pack', label: 'My pack' },
  { value: 'shared', label: 'A shared pack' },
]
const ready = computed(() => (pub.what === 'command' ? !!pub.command : pub.what === 'pack' ? !!pub.pack : !!pub.pack.trim() && !!pub.owner.trim()))
async function publish() {
  if (!ready.value) return
  let needs: Record<string, string[]> | undefined
  const run = async () => {
    const answer =
      pub.what === 'command'
        ? await admin.publish(props.login, pub.command, pub.as.trim() || undefined)
        : await admin.publishPack(props.login, pub.pack.trim(), pub.what === 'shared' ? loginOf(pub.owner) : undefined)
    needs = (answer as { needs_grants?: Record<string, string[]> }).needs_grants
  }
  const label = pub.what === 'command' ? `${props.sign}${pub.as.trim() || pub.command}` : pub.pack.trim()
  if (!(await act('pub', run, `Published ${label} in #${props.login}`))) return
  pub.open = false
  const missing = Object.entries(needs ?? {}).filter(([, vars]) => vars.length)
  if (missing.length) {
    toast.show(`It writes channel variables it isn't granted yet: ${missing.map(([c, v]) => `${c} (${v.join(', ')})`).join('; ')}. Grant them below.`, { duration: 8000 })
  }
}
const unpublishing = ref<{ kind: 'command' | 'pack'; name: string; owner?: string } | null>(null)
async function unpublish() {
  const u = unpublishing.value
  if (!u) return
  const run = () => (u.kind === 'command' ? admin.unpublish(props.login, u.name) : admin.unpublishPack(props.login, u.name, u.owner))
  if (await act('unpub', run, `Took ${u.kind === 'command' ? props.sign : ''}${u.name} down from #${props.login}`)) unpublishing.value = null
}

async function setGrant(g: Grant, variable: string, on: boolean) {
  const run = () => (on ? admin.grant(props.login, g.name, variable) : admin.ungrant(props.login, g.name, variable))
  await act(`g:${g.name}:${variable}`, run, `${props.sign}${g.name} ${on ? 'may' : 'may no longer'} write channel.${variable}`)
}
const errText = errorText
</script>

<template>
  <section class="mtab">
    <div class="head">
      <h2 class="vx-eyebrow sub">Published here</h2>
      <VxButton v-if="mayPublish && hasUser" size="sm" variant="primary" @click="openPublish">Publish</VxButton>
    </div>
    <p v-if="mayPublish && !hasUser" class="vx-muted small intro">Publishing names the publisher: sign in with Twitch to publish here.</p>
    <VxEmptyState v-if="!published.length" title="Nothing published here" text="Custom commands and packs published to this channel show up here." />
    <template v-else>
      <p class="vx-muted intro">
        Custom commands chat can run here. One published on its own turns on and off here, the same as
        <ChatLine :lines="`${sign}cc disable <name>`" :sign="sign" /> in chat<template v-if="!mayPublish">, for
        {{ publishRole }} and up</template>; a pack's commands turn on and off with the pack, on the Modules tab.
      </p>
      <div class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Command</th><th>Module</th><th>By</th><th>Version</th><th>State</th><th></th></tr></thead>
          <tbody>
            <tr v-for="p in published" :key="`${p.module}/${p.name}`">
              <td>
                <ChatLine :lines="`${sign}${p.name}`" :sign="sign" />
                <div v-if="p.summary" class="vx-muted small">{{ p.summary }}</div>
              </td>
              <td><RouterLink :to="{ query: { ...route.query, tab: 'modules' } }" class="vx-mono">{{ p.module }}</RouterLink></td>
              <td class="vx-muted">@{{ p.owner }}</td>
              <td class="vx-mono vx-muted">
                v{{ p.version }}
                <div v-if="p.changedSince !== null" class="small">changed since v{{ p.changedSince }}</div>
              </td>
              <td class="nowrap">
                <VxSwitch
                  v-if="toggleable(p)"
                  :model-value="p.status === 'active'"
                  :disabled="!mayPublish || busy.has(`p:${p.name}`)"
                  :label="p.status === 'active' ? 'on' : 'off'"
                  @update:model-value="(on: boolean) => toggle(p, on)"
                />
                <template v-else>
                  <VxChip :tone="p.status === 'active' ? 'ok' : 'default'">{{ p.status }}</VxChip>
                  <div v-if="p.status === 'orphaned'" class="vx-muted small">its owner deleted it</div>
                </template>
              </td>
              <td class="end">
                <VxButton
                  v-if="mayPublish && hasUser && p.module === CUSTOM_MODULE"
                  size="sm"
                  variant="ghost"
                  @click="unpublishing = { kind: 'command', name: p.name }"
                >Unpublish</VxButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="packs.length">
      <h2 class="vx-eyebrow sub">Packs</h2>
      <div class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Pack</th><th>Commands</th><th>Where</th><th></th></tr></thead>
          <tbody>
            <tr v-for="p in packs" :key="`${p.scope}/${p.name}`">
              <td class="vx-mono">{{ p.name }}<div v-if="p.summary" class="vx-muted small">{{ p.summary }}</div></td>
              <td class="vx-muted small">{{ p.commands.map((c) => c.name).join(', ') }}</td>
              <td><VxChip :tone="p.scope === 'global' ? 'default' : 'accent'">{{ p.scope === 'global' ? 'everywhere' : 'here' }}</VxChip></td>
              <td class="end">
                <VxButton
                  v-if="mayPublish && hasUser && channelPacks.includes(p)"
                  size="sm"
                  variant="ghost"
                  @click="unpublishing = { kind: 'pack', name: p.name, owner: packOwner(p) }"
                >Unpublish</VxButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <h2 class="vx-eyebrow sub">Variable grants</h2>
    <p class="vx-muted intro">
      A published command writes this channel's variables only where the channel lets it, as
      <ChatLine :lines="`${sign}cc grant <name> <variable>`" :sign="sign" /> does in chat<template v-if="!mayGrant">
      (for {{ grantRole }} and up)</template>.
    </p>
    <VxCallout v-if="grants.error.value" tone="error" title="Couldn't load the grants">{{ errorText(grants.error.value) }}</VxCallout>
    <VxEmptyState v-else-if="grants.data.value && !grants.data.value.length" title="Nothing to grant" text="No command published here writes channel variables." />
    <div v-else-if="grants.data.value" class="table-scroll vx-panel">
      <table class="vx-table">
        <thead><tr><th>Command</th><th>By</th><th>May write</th></tr></thead>
        <tbody>
          <tr v-for="g in grants.data.value" :key="g.id">
            <td><ChatLine :lines="`${sign}${g.name}`" :sign="sign" /></td>
            <td class="vx-muted">@{{ g.owner }}</td>
            <td class="vars">
              <VxCheckbox
                v-for="v in [...new Set([...g.writes, ...g.granted])]"
                :key="v"
                :model-value="g.granted.includes(v)"
                :disabled="!mayGrant || busy.has(`g:${g.name}:${v}`)"
                :label="`channel.${v}`"
                @update:model-value="(on: boolean) => setGrant(g, v, on)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <VxDialog v-model:open="pub.open" :title="`Publish in #${login}`" width="520px">
      <form id="pub-form" class="dialog-form" @submit.prevent="publish">
        <VxSegmented v-model="pub.what" :options="WHAT" label="What to publish" />
        <VxCallout v-if="mine.error.value" tone="error" title="Couldn't load your commands">{{ errText(mine.error.value) }}</VxCallout>
        <template v-if="pub.what === 'command'">
          <VxField label="Your command" :help="mine.data.value && !mine.data.value.commands.length ? 'You have no commands yet: make one on your Me page.' : undefined">
            <template #default="{ id }">
              <VxSelect :id="id" v-model="pub.command" :options="(mine.data.value?.commands ?? []).map((c) => ({ value: c, label: c }))" width="100%" />
            </template>
          </VxField>
          <VxField label="Publish as" help="Optional: another name for it here.">
            <template #default="{ id }"><VxInput :id="id" v-model="pub.as" mono :placeholder="pub.command" /></template>
          </VxField>
        </template>
        <VxField v-else-if="pub.what === 'pack'" label="Your pack">
          <template #default="{ id }">
            <VxSelect :id="id" v-model="pub.pack" :options="(mine.data.value?.packs ?? []).map((c) => ({ value: c, label: c }))" width="100%" />
          </template>
        </VxField>
        <template v-else>
          <VxField label="Owner" help="Every command in their pack must be shared.">
            <template #default="{ id }"><VxInput :id="id" v-model="pub.owner" mono placeholder="login" /></template>
          </VxField>
          <VxField label="Pack">
            <template #default="{ id }"><VxInput :id="id" v-model="pub.pack" mono /></template>
          </VxField>
        </template>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="pub-form" variant="primary" :loading="busy.has('pub')" :disabled="!ready">Publish</VxButton>
      </template>
    </VxDialog>

    <VxDialog
      :open="unpublishing !== null"
      :title="unpublishing ? `Unpublish ${unpublishing.kind === 'command' ? sign : ''}${unpublishing.name}?` : ''"
      @update:open="(v: boolean) => { if (!v) unpublishing = null }"
    >
      Chat here can't run {{ unpublishing?.kind === 'pack' ? 'its commands' : 'it' }} any more. The command itself stays
      with its owner, who can publish it again.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="busy.has('unpub')" @click="unpublish">Unpublish</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.head .sub { margin: 0; }
.vars { display: flex; flex-wrap: wrap; gap: 4px 14px; }
</style>
