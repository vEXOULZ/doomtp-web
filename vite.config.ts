import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// What the bot serves itself. In production the site shares an origin with the bot and the reverse proxy sends
// these paths to it; in dev, Vite forwards them so the same relative URLs work. `/docs` alone is the bot's OpenAPI
// page, while `/docs/…` are this site's pages, so that one matches exactly (a key starting with ^ is a RegExp).
const BOT_PATHS = ['/api', '/auth', '/static', '/healthz', '/readyz', '/openapi.json', '^/docs$']

/** The commit this build comes from, shown in the footer (empty outside a git checkout). */
function commit(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return process.env.GITHUB_SHA ?? ''
  }
}

export default defineConfig(({ mode }) => {
  // Env files next to this config, not in process.cwd(): `vite <dir>` can be started from another folder.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  // Default: the bot's dev API (doomtp-bot's `scripts/dev_api.py`), with made-up data.
  const target = env.VITE_DEV_BOT_TARGET || 'http://127.0.0.1:8080'
  return {
    define: { __COMMIT__: JSON.stringify(commit()) },
    plugins: [
      vue({
        // <dtb-editor> is the bot's own web component (/static/editor/editor.js), not a Vue one.
        template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('dtb-') } },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5176,
      proxy: Object.fromEntries(BOT_PATHS.map((path) => [path, { target, changeOrigin: true }])),
    },
    test: { include: ['tests/**/*.test.ts'] },
  }
})
