<script setup lang="ts">
// Your own custom commands, as `cc` manages them in chat: write one, edit its body, summary and parameters, share
// it, look back through its versions and revert, delete it; and your aliases for other people's commands.
// A command is written "from" a channel, as `cc add` is typed in one: that channel's create role, filter and
// command sign apply.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSelect, VxSkeleton, VxSwitch, timeAgo } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import { admin, type MyCommand } from '@/lib/admin'
import type { Param } from '@/lib/api'
import { session } from '@/lib/session'
import { useAct } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const { data, error, reload } = useLoad(() => admin.myCommands())
const { busy, act } = useAct(reload)

/** Where a new command is written from: your own channel, else the first you moderate. */
const homeChannel = computed(() => {
  if (session.ownChannel?.joined) return session.ownChannel.login
  return Object.keys(session.channelRoles ?? {}).sort()[0] ?? ''
})
const NAME = /^[a-z0-9_]{1,32}$/
const clean = (s: string) => s.trim().toLowerCase().replace(/^[^\w]+/, '')
const where = (c: MyCommand) =>
  (c.publications ?? []).map((p) => (p.channel === 'global' ? `everywhere as ${p.name}` : `#${p.channel}${p.name !== c.name ? ` as ${p.name}` : ''}`))

// ── writing a new one ──
const draft = reactive({ open: false, name: '', channel: '', body: '', summary: '' })
function openNew() {
  Object.assign(draft, { open: true, name: '', channel: homeChannel.value, body: '', summary: '' })
}
const draftOk = computed(() => NAME.test(clean(draft.name)) && !!draft.channel.trim() && !!draft.body.trim())
async function create() {
  if (!draftOk.value) return
  const name = clean(draft.name)
  const body = { name, body: draft.body.trim(), summary: draft.summary.trim() || undefined, channel: clean(draft.channel) }
  if (await act('new', () => admin.createCommand(body), `${name} created`)) draft.open = false
}

// ── editing: body, summary and sharing in one PATCH; parameters one at a time ──
const edit = reactive({ open: false, name: '', body: '', summary: '', shareable: false, channel: '', params: [] as Param[] })
const editing = ref<MyCommand | null>(null)
function openEdit(c: MyCommand) {
  editing.value = c
  Object.assign(edit, { open: true, name: c.name, body: c.body, summary: c.summary ?? '', shareable: c.shareable, channel: homeChannel.value, params: c.params ?? [] })
}
const editPatch = computed(() => {
  const c = editing.value
  if (!c) return {}
  const out: { body?: string; summary?: string; shareable?: boolean; channel?: string } = {}
  if (edit.body.trim() && edit.body.trim() !== c.body) out.body = edit.body.trim()
  if (edit.summary.trim() !== (c.summary ?? '')) out.summary = edit.summary.trim()
  if (edit.shareable !== c.shareable) out.shareable = edit.shareable
  return out
})
async function saveEdit() {
  const patch = editPatch.value
  if (!Object.keys(patch).length) return
  if (patch.body && edit.channel.trim()) patch.channel = clean(edit.channel)
  if (await act('edit', () => admin.editCommand(edit.name, patch), `${edit.name} saved`)) edit.open = false
}

// A parameter: `cc param <name> <pos> name=… type=… "<description>"`.
const TYPES = ['str', 'int', 'float', 'bool', 'range', 'duration', 'user', 'url', 'choice', 'list', 'map', 'any'].map((t) => ({ value: t, label: t }))
const param = reactive({ position: '1', name: '', type: 'str', required: false, choices: '', description: '' })
function nextPosition() {
  const used = edit.params.map((p) => parseInt(p.position, 10)).filter((n) => !Number.isNaN(n))
  return String((used.length ? Math.max(...used) : 0) + 1)
}
function pickParam(p?: Param) {
  Object.assign(param, p
    ? { position: p.position, name: p.name, type: p.type, required: p.required, choices: (p.choices ?? []).join(', '), description: p.description }
    : { position: nextPosition(), name: '', type: 'str', required: false, choices: '', description: '' })
}
const paramOk = computed(() => /^[1-9][0-9]*\+?$/.test(param.position.trim()) && !!param.name.trim() && (param.type !== 'choice' || !!param.choices.trim()))
async function afterParam() {
  await reload()
  const fresh = data.value?.commands.find((c) => c.name === edit.name)
  if (fresh) edit.params = fresh.params ?? []
}
async function saveParam() {
  if (!paramOk.value) return
  const choices = param.type === 'choice' ? param.choices.split(',').map((s) => s.trim()).filter(Boolean) : undefined
  const body = { name: param.name.trim(), type: param.type, required: param.required, choices, description: param.description.trim() }
  if (await act('param', () => admin.setParam(edit.name, param.position.trim(), body), `Parameter ${param.position.trim()} saved`)) {
    await afterParam()
    pickParam()
  }
}
async function dropParam(p: Param) {
  if (await act(`param:${p.position}`, () => admin.deleteParam(edit.name, p.position), `Parameter ${p.position} removed`)) await afterParam()
}

// ── versions ──
const history = ref<string | null>(null)
const versions = useLoad(async () => (history.value ? admin.commandVersions(history.value) : null), () => history.value)
async function revert(version: number) {
  const name = history.value
  if (!name) return
  if (await act(`rev:${version}`, () => admin.revertCommand(name, version), `${name} is back to v${version} (as a new version)`)) await versions.reload()
}

const deleting = ref<MyCommand | null>(null)

// ── links: your name for someone else's command ──
const link = reactive({ open: false, alias: '', command: '', from: 'owner', where: '' })
const FROM = [
  { value: 'owner', label: 'Someone who shared it' },
  { value: 'channel', label: 'A channel that published it' },
]
const linkOk = computed(() => NAME.test(clean(link.alias)) && !!clean(link.command) && !!clean(link.where))
async function saveLink() {
  if (!linkOk.value) return
  const alias = clean(link.alias)
  const body = { command: clean(link.command), [link.from]: clean(link.where) }
  if (await act('link', () => admin.link(alias, body), `${alias} linked`)) link.open = false
}
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load your commands">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 4" :key="i" h="38px" /></div>
    <template v-else>
      <div class="head">
        <p class="vx-muted intro">
          The commands you wrote, the same as <ChatLine lines="!cc list" sign="!" /> in chat. They run wherever
          they're published; share one and others can link it or publish it too.
        </p>
        <VxButton variant="primary" size="sm" @click="openNew">New command</VxButton>
      </div>
      <VxEmptyState v-if="!data.commands.length" title="No commands yet" text="Write one here, or with !cc add in a channel the bot is in." />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Command</th><th>Body</th><th>Version</th><th>Published</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in data.commands" :key="c.id">
              <td class="nowrap">
                <span class="vx-mono">{{ c.name }}</span>
                <VxChip v-if="c.shareable" tone="accent" class="chip">shared</VxChip>
                <div v-if="c.summary" class="vx-muted small">{{ c.summary }}</div>
              </td>
              <td class="wrap body"><ChatLine :lines="c.body" sign="!" context="body" /></td>
              <td class="vx-mono vx-muted">v{{ c.version }}</td>
              <td class="small">
                <div v-for="w in where(c)" :key="w">{{ w }}</div>
                <span v-if="!where(c).length" class="vx-muted">nowhere yet</span>
                <div v-if="c.links" class="vx-muted">{{ c.links }} linked</div>
              </td>
              <td class="end">
                <VxButton size="sm" variant="ghost" @click="openEdit(c)">Edit</VxButton>
                <VxButton size="sm" variant="ghost" @click="history = c.name">History</VxButton>
                <VxButton size="sm" variant="ghost" @click="deleting = c">Delete</VxButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="head">
        <h2 class="vx-eyebrow sub">Linked</h2>
        <VxButton size="sm" @click="Object.assign(link, { open: true, alias: '', command: '', from: 'owner', where: '' })">Link a command</VxButton>
      </div>
      <p class="vx-muted intro">
        Your own name for someone else's command, as <ChatLine lines="!cc link <alias> <owner> <command>" sign="!" />:
        you can publish it under that name where you may publish.
      </p>
      <VxEmptyState v-if="!data.linked.length" title="No links" />
      <div v-else class="table-scroll vx-panel">
        <table class="vx-table">
          <thead><tr><th>Your name</th><th>Command</th><th>By</th><th></th></tr></thead>
          <tbody>
            <tr v-for="l in data.linked" :key="l.alias">
              <td class="vx-mono">{{ l.alias }}</td>
              <td class="vx-mono">{{ l.name }}<div v-if="l.summary" class="vx-muted small">{{ l.summary }}</div></td>
              <td class="vx-muted">@{{ l.owner }}</td>
              <td class="end">
                <VxButton size="sm" variant="ghost" :loading="busy.has(`ul:${l.alias}`)" @click="act(`ul:${l.alias}`, () => admin.unlink(l.alias), `${l.alias} unlinked`)">Unlink</VxButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <VxDialog v-model:open="draft.open" title="New command" width="600px">
      <form id="new-cmd" class="dialog-form" @submit.prevent="create">
        <VxField label="Name" help="Lowercase letters, digits and _, without the sign.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.name" mono placeholder="hug" :invalid="!!draft.name && !NAME.test(clean(draft.name))" /></template>
        </VxField>
        <VxField label="Written from" help="A channel the bot is in: its create role, word filter and command sign apply.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.channel" mono placeholder="channel" /></template>
        </VxField>
        <VxField label="Body" help="An expression, as after !cc add <name>.">
          <template #default="{ id }"><textarea :id="id" v-model="draft.body" class="body-input" spellcheck="false" placeholder="echo {$chatter.name} hugs {arg.1}"></textarea></template>
        </VxField>
        <VxField label="Summary" help="Optional: one line for help and lists.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.summary" /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="new-cmd" variant="primary" :loading="busy.has('new')" :disabled="!draftOk">Create</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="edit.open" :title="`Edit ${edit.name}`" width="680px">
      <form id="edit-cmd" class="dialog-form" @submit.prevent="saveEdit">
        <VxField label="Body">
          <template #default="{ id }"><textarea :id="id" v-model="edit.body" class="body-input" spellcheck="false"></textarea></template>
        </VxField>
        <VxField v-if="editPatch.body" label="Checked in" help="The channel whose word filter and sign the new body is checked against; empty: the bot-wide filter.">
          <template #default="{ id }"><VxInput :id="id" v-model="edit.channel" mono /></template>
        </VxField>
        <VxField label="Summary">
          <template #default="{ id }"><VxInput :id="id" v-model="edit.summary" /></template>
        </VxField>
        <VxSwitch v-model="edit.shareable" label="Shared: others may link and publish it" />
      </form>
      <h3 class="vx-eyebrow sub">Parameters</h3>
      <p class="vx-muted small">Positions run 1, 2, 3…; one N+ at the end takes the rest of the line. Each saves on its own.</p>
      <table v-if="edit.params.length" class="vx-table params">
        <tbody>
          <tr v-for="p in edit.params" :key="p.position">
            <td class="vx-mono">{{ p.position }}</td>
            <td class="vx-mono">{{ p.name }}<span class="vx-muted">: {{ p.type }}{{ p.required ? '' : '?' }}</span></td>
            <td class="vx-muted small">{{ p.description }}<template v-if="p.choices?.length"> ({{ p.choices.join(', ') }})</template></td>
            <td class="end">
              <VxButton size="sm" variant="ghost" @click="pickParam(p)">Edit</VxButton>
              <VxButton size="sm" variant="ghost" :loading="busy.has(`param:${p.position}`)" @click="dropParam(p)">Remove</VxButton>
            </td>
          </tr>
        </tbody>
      </table>
      <form class="param-form" @submit.prevent="saveParam">
        <VxField label="Position">
          <template #default="{ id }"><VxInput :id="id" v-model="param.position" mono class="pos" /></template>
        </VxField>
        <VxField label="Name">
          <template #default="{ id }"><VxInput :id="id" v-model="param.name" mono /></template>
        </VxField>
        <VxField label="Type">
          <template #default="{ id }"><VxSelect :id="id" v-model="param.type" :options="TYPES" /></template>
        </VxField>
        <VxCheckbox v-model="param.required" label="Required" />
        <VxField v-if="param.type === 'choice'" label="Choices" help="Comma-separated.">
          <template #default="{ id }"><VxInput :id="id" v-model="param.choices" /></template>
        </VxField>
        <VxField label="Description" class="grow">
          <template #default="{ id }"><VxInput :id="id" v-model="param.description" /></template>
        </VxField>
        <VxButton type="submit" size="sm" :loading="busy.has('param')" :disabled="!paramOk">Save parameter</VxButton>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Close</VxButton>
        <VxButton type="submit" form="edit-cmd" variant="primary" :loading="busy.has('edit')" :disabled="!Object.keys(editPatch).length">Save</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="history !== null" :title="`${history} · history`" width="680px" @update:open="(v: boolean) => { if (!v) history = null }">
      <VxCallout v-if="versions.error.value" tone="error" title="Couldn't load its versions">{{ versions.error.value }}</VxCallout>
      <div v-else-if="!versions.data.value" class="loading"><VxSkeleton v-for="i in 3" :key="i" h="38px" /></div>
      <table v-else class="vx-table">
        <tbody>
          <tr v-for="v in [...versions.data.value.versions].reverse()" :key="v.version">
            <td class="vx-mono nowrap">v{{ v.version }}</td>
            <td class="wrap"><ChatLine :lines="v.body" sign="!" context="body" /></td>
            <td class="vx-muted small nowrap" :title="new Date(v.created_at).toLocaleString()">{{ timeAgo(v.created_at) }}</td>
            <td class="end">
              <VxChip v-if="v.version === versions.data.value.current" tone="ok">current</VxChip>
              <VxButton v-else size="sm" variant="ghost" :loading="busy.has(`rev:${v.version}`)" @click="revert(v.version)">Revert to this</VxButton>
            </td>
          </tr>
        </tbody>
      </table>
      <template #actions="{ close }"><VxButton @click="close">Close</VxButton></template>
    </VxDialog>

    <VxDialog :open="deleting !== null" :title="`Delete ${deleting?.name}?`" @update:open="(v: boolean) => { if (!v) deleting = null }">
      It stops running everywhere it's published<template v-if="deleting?.links">, and the {{ deleting.links }} links to it stop working</template>.
      This can't be undone.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('del')"
          @click="act('del', () => admin.deleteCommand(deleting!.name), `${deleting!.name} deleted`).then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>

    <VxDialog v-model:open="link.open" title="Link a command" width="520px">
      <form id="link-form" class="dialog-form" @submit.prevent="saveLink">
        <VxField label="Your name for it">
          <template #default="{ id }"><VxInput :id="id" v-model="link.alias" mono /></template>
        </VxField>
        <VxField label="From">
          <template #default="{ id }"><VxSelect :id="id" v-model="link.from" :options="FROM" width="100%" /></template>
        </VxField>
        <VxField :label="link.from === 'owner' ? 'Owner' : 'Channel'">
          <template #default="{ id }"><VxInput :id="id" v-model="link.where" mono placeholder="login" /></template>
        </VxField>
        <VxField label="Command" :help="link.from === 'channel' ? 'The name it has in that channel.' : 'Its name; it must be shared.'">
          <template #default="{ id }"><VxInput :id="id" v-model="link.command" mono /></template>
        </VxField>
      </form>
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton type="submit" form="link-form" variant="primary" :loading="busy.has('link')" :disabled="!linkOk">Link</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; margin-top: 18px; }
.head:first-child { margin-top: 0; }
.head .intro { flex: 1 1 24rem; }
.head .sub { margin: 0; }
.chip { margin-left: 6px; }
.body { max-width: 26rem; }
.params { margin-bottom: 10px; }
.param-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 12px; }
.param-form .pos { width: 5rem; }
.param-form .grow { flex: 1 1 14rem; }
</style>
