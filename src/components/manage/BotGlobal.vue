<script setup lang="ts">
// What reaches every channel, for bot admins: the admins themselves (`admin add|remove`, bot owners only), the
// bot-wide module toggles and command rules every channel inherits, the bot-wide word filter, who is ignored
// everywhere, and the commands and packs published everywhere.
import { VxButton, VxCallout, VxChip, VxDialog, VxField, VxInput, VxSegmented, VxSkeleton } from '@vexoulz/ui'
import { computed, reactive, ref } from 'vue'
import FilterTab from '@/components/manage/FilterTab.vue'
import IgnoredTab from '@/components/manage/IgnoredTab.vue'
import RulesTab from '@/components/manage/RulesTab.vue'
import { admin, readIgnored, type AdminUser, type GlobalCommand } from '@/lib/admin'
import { api } from '@/lib/api'
import { referenceRows } from '@/lib/commands'
import type { CommandRow, LogLevel } from '@/lib/modules'
import { useAct } from '@/lib/useAct'
import { defaultSign, loadSite } from '@/lib/site'
import { useLoad } from '@/lib/useLoad'
import { atName, loginOf } from '@/lib/format'

const { data, error, reload } = useLoad(async () => {
  const [admins, modules, commands, filters, ignored, roles, published, packs, channels, builtins, site] = await Promise.all([
    admin.admins(),
    admin.globalModules(),
    admin.globalCommands(),
    admin.globalFilters(),
    admin.ignoredEverywhere(),
    api.roles(),
    api.globalCommands(),
    api.packs(),
    admin.channels(),
    api.commands(),
    loadSite(),
  ])
  const globalPacks = packs.packs.filter((p) => p.scope === 'global')
  return {
    admins,
    modules: modules.modules,
    commands: commands.commands.map(asRow).sort((a, b) => a.name.localeCompare(b.name)),
    filters: filters.filters,
    ignored: ignored.ignored.map((e) => readIgnored(e, true)),
    roles: roles.roles.filter((r) => r.rank <= 100).map((r) => r.name),
    published: published.commands,
    packs: globalPacks,
    reference: referenceRows(builtins.commands, published.commands, globalPacks, site?.default_prefix ?? defaultSign()),
    // Ignoring everywhere goes through a channel's route; any joined channel does.
    anchor: channels.channels[0]?.login ?? null,
  }
})
const { busy, act } = useAct(reload)
const sign = computed(defaultSign)

/** The bot-wide rule as the rules table reads a channel's: unset means on, and the command's own role. */
function asRow(c: GlobalCommand): CommandRow {
  return {
    name: c.name,
    module: c.module,
    summary: c.summary,
    enabled: c.enabled ?? true,
    required_role: c.required_role ?? undefined,
    allowed_roles: c.allowed_roles,
    cooldowns: c.cooldowns ?? undefined,
    log_level: (c.log_level as LogLevel | null) ?? undefined,
    toggleable: c.toggleable,
    fixedPolicy: c.fixed_policy,
  }
}

const section = ref('admins')
const SECTIONS = [
  { value: 'admins', label: 'Admins' },
  { value: 'modules', label: 'Modules' },
  { value: 'rules', label: 'Command rules' },
  { value: 'filter', label: 'Word filter' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'published', label: 'Published' },
]

// ── admins ──
const adminLogin = ref('')
const name = (u: AdminUser) => atName(u.login, u.user_id)
async function addAdmin() {
  const who = loginOf(adminLogin.value).toLowerCase()
  if (who && (await act('admin', () => admin.addAdmin(who), `@${who} is a bot admin`))) adminLogin.value = ''
}
const removing = ref<AdminUser | null>(null)

// ── modules ──
const moduleState = (on: boolean | null) => (on === null ? 'default' : on ? 'on' : 'off')
const MODULE_STATES = [
  { value: 'default', label: 'Each channel' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]
function setModule(module: string, state: string) {
  if (state === 'default') return act(`m:${module}`, () => admin.resetGlobalModule(module), `${module} left to each channel`)
  return act(`m:${module}`, () => admin.setGlobalModule(module, state === 'on'), `${module} ${state} everywhere`)
}

// ── published everywhere ──
const publishing = reactive({ mode: 'command', command: '', as: '', pack: '', owner: '' })
const PUBLISH_MODES = [
  { value: 'command', label: 'A command' },
  { value: 'pack', label: 'A pack' },
]
async function publish() {
  const p = publishing
  const ok =
    p.mode === 'command'
      ? await act('publish', () => admin.publishGlobal(p.command.trim(), p.as.trim() || undefined), `${p.as.trim() || p.command.trim()} published everywhere`)
      : await act('publish', () => admin.publishGlobalPack(p.pack.trim(), loginOf(p.owner) || undefined), `Pack ${p.pack.trim()} published everywhere`)
  if (ok) Object.assign(publishing, { command: '', as: '', pack: '', owner: '' })
}
const mayPublish = computed(() => (publishing.mode === 'command' ? !!publishing.command.trim() : !!publishing.pack.trim()))
const unpublishing = ref<{ kind: 'command' | 'pack'; name: string; owner?: string } | null>(null)
function unpublish() {
  const u = unpublishing.value
  if (!u) return
  const run = u.kind === 'command' ? () => admin.unpublishGlobal(u.name) : () => admin.unpublishGlobalPack(u.name, u.owner)
  act('unpublish', run, `${u.name} taken down everywhere`).then(() => (unpublishing.value = null))
}
</script>

<template>
  <section>
    <h2 class="vx-eyebrow sec">Every channel</h2>
    <p class="vx-muted small">What every channel inherits, as the <code>global</code> forms of the chat commands.</p>
    <VxCallout v-if="error" tone="error" title="Couldn't load the bot-wide settings">
      {{ error }}
      <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
    </VxCallout>
    <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 5" :key="i" h="38px" /></div>
    <template v-else>
      <VxSegmented v-model="section" :options="SECTIONS" label="Bot-wide settings" class="pick" />

      <template v-if="section === 'admins'">
        <p class="vx-muted small">
          Bot admins manage every channel and this page. Owners are set in the bot's configuration; only an owner adds
          or removes admins, as with <code>admin add</code> in chat.
        </p>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <tbody>
              <tr v-for="u in data.admins.owners" :key="u.user_id">
                <td class="vx-mono">{{ name(u) }}</td>
                <td><VxChip tone="accent">owner</VxChip></td>
                <td></td>
              </tr>
              <tr v-for="u in data.admins.admins" :key="u.user_id">
                <td class="vx-mono">{{ name(u) }}</td>
                <td><VxChip>admin</VxChip></td>
                <td class="end">
                  <VxButton v-if="data.admins.you_manage" size="sm" variant="ghost" @click="removing = u">Remove</VxButton>
                </td>
              </tr>
              <tr v-if="!data.admins.owners.length && !data.admins.admins.length"><td colspan="3" class="vx-muted">No bot admins are set: only the admin password manages the bot.</td></tr>
            </tbody>
          </table>
        </div>
        <form v-if="data.admins.you_manage" class="row" @submit.prevent="addAdmin">
          <label class="sr-only" for="admin-login">Twitch login to make an admin</label>
          <VxInput id="admin-login" v-model="adminLogin" placeholder="twitch login" mono />
          <VxButton type="submit" :loading="busy.has('admin')" :disabled="!adminLogin.trim()">Add admin</VxButton>
        </form>
      </template>

      <template v-else-if="section === 'modules'">
        <p class="vx-muted small">
          "Each channel" leaves a module to the channels (on unless one turns it off). On or off here applies wherever a
          channel hasn't set its own.
        </p>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Module</th><th>Kind</th><th>Everywhere</th></tr></thead>
            <tbody>
              <tr v-for="m in data.modules" :key="m.module">
                <td class="vx-mono">{{ m.module }}</td>
                <td class="vx-muted">{{ m.kind ?? '' }}</td>
                <td>
                  <VxSegmented
                    v-if="m.toggleable"
                    :model-value="moduleState(m.enabled)"
                    :options="MODULE_STATES"
                    :label="`${m.module} everywhere`"
                    :disabled="busy.has(`m:${m.module}`)"
                    @update:model-value="(v?: string) => v && setModule(m.module, v)"
                  />
                  <span v-else class="vx-muted">always on</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <RulesTab v-else-if="section === 'rules'" :login="null" :sign="sign" :commands="data.commands" :reference="data.reference" :roles="data.roles" :reload="reload" />

      <FilterTab v-else-if="section === 'filter'" :login="null" :filters="data.filters" :reload="reload" />

      <IgnoredTab v-else-if="section === 'ignored'" :login="data.anchor" :sign="sign" :ignored="data.ignored" :reload="reload" everywhere />

      <template v-else>
        <p class="vx-muted small">
          Commands and packs every channel has, as <code>cc publish &lt;name&gt; global</code> does in chat. A channel still
          turns them off for itself.
        </p>
        <div class="table-scroll vx-panel">
          <table class="vx-table">
            <thead><tr><th>Name</th><th>Owner</th><th>What</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in data.published" :key="`c:${c.published_as}`">
                <td class="vx-mono">{{ c.published_as }}</td>
                <td class="vx-muted">{{ c.owner }}</td>
                <td class="vx-muted">{{ c.summary ?? (c.name !== c.published_as ? `as ${c.name}` : 'command') }}</td>
                <td class="end"><VxButton size="sm" variant="ghost" @click="unpublishing = { kind: 'command', name: c.published_as }">Unpublish</VxButton></td>
              </tr>
              <tr v-for="p in data.packs" :key="`p:${p.name}:${p.commands[0]?.owner}`">
                <td class="vx-mono">{{ p.name }} <VxChip>pack</VxChip></td>
                <td class="vx-muted">{{ p.commands[0]?.owner ?? '' }}</td>
                <td class="vx-muted">{{ p.summary ?? `${p.commands.length} commands` }}</td>
                <td class="end">
                  <VxButton size="sm" variant="ghost" @click="unpublishing = { kind: 'pack', name: p.name, owner: p.commands[0]?.owner }">Unpublish</VxButton>
                </td>
              </tr>
              <tr v-if="!data.published.length && !data.packs.length"><td colspan="4" class="vx-muted">Nothing is published everywhere.</td></tr>
            </tbody>
          </table>
        </div>
        <form class="publish vx-panel" @submit.prevent="publish">
          <VxSegmented v-model="publishing.mode" :options="PUBLISH_MODES" label="What to publish" />
          <template v-if="publishing.mode === 'command'">
            <VxField label="Your command" help="One of your commands, or one you linked.">
              <template #default="{ id }"><VxInput :id="id" v-model="publishing.command" mono /></template>
            </VxField>
            <VxField label="As" help="Optional: the name channels type.">
              <template #default="{ id }"><VxInput :id="id" v-model="publishing.as" mono /></template>
            </VxField>
          </template>
          <template v-else>
            <VxField label="Pack">
              <template #default="{ id }"><VxInput :id="id" v-model="publishing.pack" mono /></template>
            </VxField>
            <VxField label="Owner" help="Empty for your own; someone else's needs every command in it shared.">
              <template #default="{ id }"><VxInput :id="id" v-model="publishing.owner" mono placeholder="twitch login" /></template>
            </VxField>
          </template>
          <div><VxButton type="submit" variant="primary" :loading="busy.has('publish')" :disabled="!mayPublish">Publish everywhere</VxButton></div>
        </form>
      </template>
    </template>

    <VxDialog :open="removing !== null" :title="`Remove ${removing ? name(removing) : ''} as a bot admin?`" @update:open="(v: boolean) => { if (!v) removing = null }">
      They keep whatever they have in their own and moderated channels.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton
          variant="danger-solid"
          :loading="busy.has('rm-admin')"
          @click="act('rm-admin', () => admin.removeAdmin(removing!.user_id), `${name(removing!)} is no longer an admin`).then(() => (removing = null))"
        >Remove</VxButton>
      </template>
    </VxDialog>

    <VxDialog :open="unpublishing !== null" :title="`Unpublish ${unpublishing?.name} everywhere?`" @update:open="(v: boolean) => { if (!v) unpublishing = null }">
      Channels lose it at once, unless they published it themselves.
      <template #actions="{ close }">
        <VxButton @click="close">Cancel</VxButton>
        <VxButton variant="danger-solid" :loading="busy.has('unpublish')" @click="unpublish">Unpublish</VxButton>
      </template>
    </VxDialog>
  </section>
</template>

<style scoped>
.sec { margin: 0 0 8px; }
.small { font-size: 13px; margin: 0 0 8px; }
.loading { display: grid; gap: 6px; }
.pick { margin: 6px 0 14px; max-width: 100%; overflow-x: auto; }
.row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 6px; }
.row :deep(.vx-input-wrap) { flex: 1 1 12rem; max-width: 20rem; }
.end { text-align: right; }
.nowrap { white-space: nowrap; }
.publish { display: grid; gap: 12px; padding: 12px 14px; margin-top: 12px; max-width: 32rem; }
</style>
