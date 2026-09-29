<script setup lang="ts">
// Your packs, as `pack` manages them in chat: a named set of your commands that is published and turned on and off
// as one module. An internal member runs only when another command in the pack calls it.
import { VxButton, VxCallout, VxCheckbox, VxChip, VxDialog, VxEmptyState, VxField, VxInput, VxSelect, VxSkeleton, VxSwitch } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import { admin, type MyPack } from '@/lib/admin'
import { useAct } from '@/lib/useAct'
import { useLoad } from '@/lib/useLoad'

const { data, error, reload } = useLoad(async () => {
  const [packs, commands] = await Promise.all([admin.myPacks(), admin.myCommands()])
  return { packs: packs.packs.filter((p) => !p.system), commands: commands.commands.map((c) => c.name).sort() }
})
const { busy, act } = useAct(reload)

const NAME = /^[a-z0-9_]{1,32}$/
const draft = reactive({ name: '', summary: '' })
const name = computed(() => draft.name.trim().toLowerCase())
async function create() {
  if (!NAME.test(name.value)) return
  if (await act('new', () => admin.createPack(name.value, draft.summary.trim()), `Pack ${name.value} created`)) Object.assign(draft, { name: '', summary: '' })
}

const adding = reactive<Record<string, { command: string; internal: boolean }>>({})
const addFor = (p: MyPack) => (adding[p.name] ??= { command: '', internal: false })
const choices = (p: MyPack) =>
  (data.value?.commands ?? []).filter((c) => !p.commands.some((m) => m.name === c)).map((c) => ({ value: c, label: c }))
async function add(p: MyPack) {
  const a = addFor(p)
  if (!a.command) return
  if (await act(`add:${p.name}`, () => admin.addToPack(p.name, a.command, a.internal), `${a.command} added to ${p.name}`)) a.command = ''
}
const where = (p: MyPack) => p.published.map((c) => (c === 'global' ? 'everywhere' : `#${c}`))
const deleting = ref<MyPack | null>(null)
</script>

<template>
  <section class="mtab">
    <VxCallout v-if="error" tone="error" title="Couldn't load your packs">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 3" :key="i" h="38px" /></div>
    <template v-else>
      <p class="vx-muted intro">
        A pack is a set of your commands published as one module, which a channel turns on and off as a whole. Publish
        one from a channel's Published tab. Sharing it lets others publish it too, once every command in it is shared.
      </p>
      <VxEmptyState v-if="!data.packs.length" title="No packs yet" text="Create one below." />
      <div v-for="p in data.packs" :key="p.id" class="pack vx-panel">
        <div class="pack-head">
          <span class="vx-mono name">{{ p.name }}</span>
          <span v-if="p.summary" class="vx-muted small">{{ p.summary }}</span>
          <span class="grow"></span>
          <VxSwitch
            :model-value="p.shareable"
            :disabled="busy.has(`sh:${p.name}`)"
            label="Shared"
            @update:model-value="(on: boolean) => act(`sh:${p.name}`, () => admin.sharePack(p.name, on), `${p.name} ${on ? 'shared' : 'no longer shared'}`)"
          />
          <VxButton size="sm" variant="ghost" @click="deleting = p">Delete</VxButton>
        </div>
        <p class="small published">
          <span class="vx-muted">Published:</span> {{ where(p).join(', ') || 'nowhere yet' }}
        </p>
        <table v-if="p.commands.length" class="vx-table">
          <tbody>
            <tr v-for="c in p.commands" :key="c.name">
              <td class="vx-mono">{{ c.name }}</td>
              <td>
                <VxChip v-if="c.internal">internal</VxChip>
                <VxChip v-if="!c.shareable" tone="warn">not shared</VxChip>
              </td>
              <td class="end">
                <VxButton
                  size="sm"
                  variant="ghost"
                  :loading="busy.has(`rm:${p.name}:${c.name}`)"
                  @click="act(`rm:${p.name}:${c.name}`, () => admin.removeFromPack(p.name, c.name), `${c.name} taken out of ${p.name}`)"
                >Remove</VxButton>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="vx-muted small">No commands in it yet.</p>
        <form class="add-cmd" @submit.prevent="add(p)">
          <VxSelect v-model="addFor(p).command" :options="choices(p)" placeholder="Add one of your commands" :disabled="!choices(p).length" />
          <VxCheckbox v-model="addFor(p).internal" label="Internal" />
          <VxButton type="submit" size="sm" :loading="busy.has(`add:${p.name}`)" :disabled="!addFor(p).command">Add</VxButton>
        </form>
      </div>

      <form class="add vx-panel" @submit.prevent="create">
        <VxField label="New pack" help="Lowercase letters, digits and _.">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.name" mono :invalid="!!draft.name && !NAME.test(name)" /></template>
        </VxField>
        <VxField label="Summary" class="grow">
          <template #default="{ id }"><VxInput :id="id" v-model="draft.summary" /></template>
        </VxField>
        <VxButton type="submit" variant="primary" :loading="busy.has('new')" :disabled="!NAME.test(name)">Create</VxButton>
      </form>
    </template>

    <VxDialog :open="deleting !== null" :title="`Delete the ${deleting?.name} pack?`" @update:open="(v: boolean) => { if (!v) deleting = null }">
      It's taken down everywhere it's published<template v-if="deleting?.published.length"> ({{ deleting && where(deleting).join(', ') }})</template>.
      Its commands stay yours.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('del')"
          @click="act('del', () => admin.deletePack(deleting!.name), `Pack ${deleting!.name} deleted`).then(() => (deleting = null))"
        >Delete</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.pack { padding: 12px 14px; margin-bottom: 10px; }
.pack-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.pack-head .name { font-size: 15px; }
.pack-head .grow { flex: 1; }
.published { margin: 6px 0 8px; }
.add-cmd { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 10px; }
</style>
