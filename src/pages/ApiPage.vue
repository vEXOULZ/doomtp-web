<script setup lang="ts">
// The bot's HTTP API, read from its own /openapi.json so it can't drift. Swagger UI (/docs, served by the bot) stays
// linked for trying requests; this page is the one that matches the site.
import { VxButton, VxCallout, VxSkeleton } from '@vexoulz/ui'
import { computed } from 'vue'
import { useResource } from '@vexoulz/ui/utils'
import { errorText } from '@vexoulz/platform-web'
import DtpShell from '@/components/DtpShell.vue'
import { codeRuns, readOpenApi } from '@/lib/openapi'

const { data, error, reload } = useResource(async () => {
  const res = await fetch('/openapi.json', { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const doc = (await res.json()) as Record<string, unknown>
  return { version: ((doc.info as Record<string, string> | undefined)?.version ?? ''), groups: readOpenApi(doc) }
})

const TAGS: Record<string, string> = {
  site: 'Public: what the site pages print.',
  language: 'Parse and explain expressions, and the language and command reference the editor uses.',
  data: 'Channels and everything in them. Mostly admin; a few listings are public and say so.',
  session: 'Admin sign-in and API keys.',
  health: 'Liveness, readiness and metrics.',
  auth: "Twitch OAuth for the bot's account and for broadcasters connecting their channel. Browser redirects, not JSON.",
}
const groups = computed(() => data.value?.groups ?? [])
const idOf = (key: string) => key.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
</script>

<template>
  <DtpShell>
    <article class="doc api">
      <h1 class="vx-display">API</h1>
      <p class="vx-muted">
        <template v-if="data?.version">doomtp-bot {{ data.version }}. </template>Everything here is JSON over HTTP on
        this host, also described as an <a href="/openapi.json">OpenAPI document</a>. To send requests from the
        browser, use <a href="/docs">Swagger UI</a>.
      </p>

      <h2 id="access" class="vx-display">Access</h2>
      <ul>
        <li><strong>Public</strong>: the <code>site</code> and <code>language</code> endpoints, and listings marked public.</li>
        <li>
          <strong>Admin</strong>: everything else. Sign in with <code>POST /api/v1/session</code> (a cookie, plus the
          CSRF token it returns for writes), or send an API key as <code>Authorization: Bearer dtb_…</code>.
        </li>
        <li>Errors are JSON with a <code>detail</code>; <code>422</code> means the body or parameters didn't validate.</li>
      </ul>

      <VxCallout v-if="error" tone="error" title="Couldn't load the API description">
        {{ errorText(error) }}
        <template #actions><VxButton size="sm" @click="reload">Try again</VxButton></template>
      </VxCallout>
      <div v-else-if="!data" class="loading" aria-busy="true"><VxSkeleton v-for="i in 8" :key="i" h="38px" /></div>
      <template v-else>
        <nav class="tags" aria-label="Sections">
          <a v-for="g in groups" :key="g.tag" :href="`#${g.tag}`">{{ g.tag }} <span class="vx-muted">{{ g.endpoints.length }}</span></a>
        </nav>

        <section v-for="g in groups" :key="g.tag">
          <h2 :id="g.tag" class="vx-display">{{ g.tag }}</h2>
          <p v-if="TAGS[g.tag]" class="vx-muted">{{ TAGS[g.tag] }}</p>
          <details v-for="e in g.endpoints" :id="idOf(e.key)" :key="e.key" class="ep">
            <summary>
              <span class="method" :data-method="e.method">{{ e.method }}</span>
              <code class="path">{{ e.path }}</code>
              <span class="summary vx-muted">
                <template v-for="(run, j) in codeRuns(e.summary)" :key="j">
                  <code v-if="run.code">{{ run.text }}</code><template v-else>{{ run.text }}</template>
                </template>
              </span>
            </summary>
            <div class="body">
              <!-- The first paragraph is the summary line above. -->
              <p v-for="(para, i) in e.description.split(/\n\s*\n/).filter(Boolean).slice(1)" :key="i">
                <template v-for="(run, j) in codeRuns(para.replace(/\s+/g, ' '))" :key="j">
                  <code v-if="run.code">{{ run.text }}</code><template v-else>{{ run.text }}</template>
                </template>
              </p>

              <template v-for="block in [{ title: 'Parameters', fields: e.params }, { title: 'Body (JSON)', fields: e.body ?? [] }]" :key="block.title">
                <template v-if="block.fields.length">
                  <h3>{{ block.title }}</h3>
                  <div class="table-scroll">
                    <table class="vx-table">
                      <tbody>
                        <tr v-for="f in block.fields" :key="f.in + f.name">
                          <td class="name"><code>{{ f.name }}</code><span v-if="f.required" class="req" title="required">*</span></td>
                          <td class="type"><span v-if="f.in !== 'body'" class="vx-muted">{{ f.in }} · </span>{{ f.type }}</td>
                          <td>{{ f.description }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>
              </template>

              <h3>Responses</h3>
              <ul class="codes">
                <li v-for="r in e.responses" :key="r.code"><code>{{ r.code }}</code> <span class="vx-muted">{{ r.description }}</span></li>
              </ul>
            </div>
          </details>
        </section>
      </template>
    </article>
  </DtpShell>
</template>

<style scoped>
.loading { display: grid; gap: 6px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 20px 0 0; font-family: var(--vx-font-mono); font-size: 13px; }
.tags a { color: var(--vx-ink); }
.api section h2 { font-family: var(--vx-font-mono); }

.ep { border: 1px solid var(--vx-line); border-radius: var(--vx-radius-sm); background: var(--vx-surface); margin: 0 0 6px; }
.ep[open] { background: var(--vx-surface-2); }
.ep summary {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
  padding: 8px 12px; cursor: pointer; list-style: none;
}
.ep summary::-webkit-details-marker { display: none; }
.ep summary:hover { background: var(--vx-hover); }
.ep summary:focus-visible { outline: 2px solid var(--vx-ring); outline-offset: -2px; }
.method {
  flex: none; width: 4.2em; text-align: center; font: 600 11px/20px var(--vx-font-mono);
  border-radius: 4px; border: 1px solid currentColor; color: var(--vx-muted);
}
.method[data-method='GET'] { color: #8ab4f8; }
.method[data-method='POST'] { color: var(--vx-ok); }
.method[data-method='PUT'], .method[data-method='PATCH'] { color: var(--vx-warn); }
.method[data-method='DELETE'] { color: var(--vx-bad); }
/* The global .doc code pill would box every path; here the path is the row's title. */
.doc .ep code.path { padding: 0; background: none; border: 0; font-size: 13.5px; color: var(--vx-ink); overflow-wrap: anywhere; }
.summary { flex: 1 1 16rem; font-size: 13px; }
.body { padding: 4px 12px 12px; border-top: 1px solid var(--vx-line); }
.body p { margin: 10px 0; }
.body h3 { margin: 14px 0 6px; font-size: 13px; }
/* Most fields have no description yet: size to the content instead of spreading name and type apart. */
.table-scroll > table { width: auto; min-width: 0; }
.name { white-space: nowrap; }
.req { color: var(--vx-bad); margin-left: 2px; }
.type { font-family: var(--vx-font-mono); font-size: 12.5px; }
.codes { list-style: none; padding: 0; margin: 0; }
</style>
