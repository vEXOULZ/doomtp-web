# dtp.vexoulz.net

The web pages of [doomtp-bot](https://github.com/vEXOULZ/doomtp-bot), a Twitch chat bot with a composable command
language: its docs, the command reference, channel pages and chat's explain links. Vue 3 + TypeScript on the shared
[`@vexoulz/ui`](https://github.com/vEXOULZ/vexoulz-ui) design, over the bot's JSON API. It replaces the bot's own
server-rendered pages (doomtp-bot ADR-0016).

```bash
npm install
npm run dev         # http://localhost:5176 (proxies the bot's paths, see below)
npm run typecheck   # vue-tsc
npm test            # vitest
npm run build       # → dist/
git config core.hooksPath .githooks   # once per clone: branch-name rules, see CONTRIBUTING.md
```

`main` is merge-only and branches follow [Conventional Branch](https://conventional-branch.github.io/)
(`feature/…`, `bugfix/…`, `hotfix/…`, `release/…`, `chore/…`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Pages

The same URLs as the bot's own pages, so links already out there keep working (chat's explain links included).

| path | what |
|---|---|
| `/` | what the bot is, "try it in chat", where to start, the channels it's in |
| `/docs/features` | every part of the bot, section by section |
| `/docs/commands` | every built-in and everything published for every channel, in a searchable table |
| `/docs/language` | the language reference, with the bot's own editor to try a line in, and the grammar |
| `/docs/api` | every endpoint of the JSON API, read from the bot's `/openapi.json` |
| `/channels/:login` | a channel's sign, tier and status, and the custom commands published there |
| `/explain/:token` | the report behind a chat `explain` link |
| anything else | 404 |

Admin pages (sign-in, channels, API keys, a channel's modules, triggers and filters) come next.

## The bot, same origin

The site expects to share an origin with the bot. The bot keeps serving:

- `/api/*`: the JSON API these pages read.
- `/auth/*`: the bot's Twitch OAuth (bot account, broadcaster connect).
- `/static/*`: the expression editor (`/static/editor/editor.js`, a `<dtb-editor>` web component), the bot's lexer
  (`/static/editor/tokens.js`, which colours every command line on these pages the way the editor does) and the
  railroad diagrams.
- `/healthz`, `/readyz`: health.
- Exactly `/docs` and `/openapi.json`: the bot's Swagger UI and OpenAPI document (`/docs/api` reads the latter).
  **`/docs/…` below it are this site's pages.**

Everything else is this site: a single-page app, so the server answers unknown paths with `index.html`. Because it
is one origin, there is no CORS, and the admin session stays a plain same-origin cookie.

In `npm run dev`, Vite forwards those paths to `VITE_DEV_BOT_TARGET` (see `.env.example`). The default is
`http://127.0.0.1:8080`, where doomtp-bot's `scripts/dev_api.py` serves the real API with made-up data and no Twitch:

```bash
# in a doomtp-bot checkout
docker compose --profile test up -d postgres-test
python scripts/dev_api.py
```

## Publishing

`.github/workflows/publish.yml` builds and pushes `dist/` to the `deploy` branch on every merge to `main`.
`@vexoulz/ui` is pinned to a git tag in `package.json`, and Renovate opens the bumps.

## Infrastructure

This repo is host-agnostic: it builds and publishes, nothing more. Details about where or how the site is hosted
(machines, addresses, proxy or tunnel config, server paths, deploy scripts) belong in the private `homelab-docs`
repo and must never be committed here. `.gitignore` blocks `.env*` (except `.env.example`), `*.local.*` and
`/deploy.local/` so local host files can't slip in.

## Fonts

`public/fonts/twemoji-sign.woff2` is one glyph (🏜, the default command sign) cut from Twemoji, so the sign looks
the same in text, inputs and the editor on every system. Licences and how to rebuild it: `public/fonts/ATTRIBUTION.md`.
