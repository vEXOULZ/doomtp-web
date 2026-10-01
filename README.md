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

### Manage

Signing in adds a **Manage** bar at the top of every page, with a switcher for the channels you manage. There's no
separate admin site. Everything under `/manage` needs a session with the bot. Without one, you go through the bot's
Twitch sign-in and come back; if that isn't set up, you land on `/admin/login`. There are two ways in (the bot's
ADR-0017 and ADR-0026):

- **Sign in with Twitch** (`/auth/admin/login` on the bot, offered when the bot's `/api/v1/session` says
  `twitch_login`). The account menu's "Sign in" uses it too. Someone already signed in to their vexoulz account
  without a bot session goes through it once per tab, silently.
  - **The bot's owners and admins** see everything.
  - **Everyone else** gets what they may do in chat:
    - In a channel they **moderate**: settings, modules, command rules, publications, triggers, filters, ignored
      users, backfill, runs and the chat log.
    - As the channel's **broadcaster**, also: logging, the "who may" roles, and leaving.
    - **Anyone signed in** gets Me, Explain, their own changes in Audit, and a button to add the bot to their own
      channel (at once), or to connect it for the full tier.

  The bot refuses anything above your rank itself; the pages just don't offer it. Failures come back as
  `/admin/login?error=<reason>`.
- **The admin password** (`ADMIN_PASSWORD`): the admin view, and the way in when Twitch is down. The bot takes it
  only from its local network by default (`ADMIN_PASSWORD_NETWORKS`), so from outside the page offers Twitch alone.

| path | what |
|---|---|
| `/admin/login` | sign in with Twitch, or with the admin password |
| `/manage` | your channels and your rank in each, adding the bot to your channel, recent changes |
| `/manage/me` | your channel, the channels you moderate, and what you changed |
| `/manage/channels/:login` | one channel: settings, modules, command rules (on or off, who may run it, log level), published packs, triggers and timers, word filter, ignored users; leave or rejoin |
| `/manage/explain` | explain an expression in any channel, and optionally run it; in a channel you manage, as a chatter you name, with the badges you pick |
| `/manage/audit` | configuration changes, from chat, here or an API key, and the writes the bot refused (`/api/v2/audit`): every channel's for an admin, else your channels' and your own |
| `/manage/bot` | bot admins: health, joining a channel, API keys |

Old `/admin/...` links redirect to `/manage/...`. The public channel page shows a "Manage" button to anyone who
manages that channel.

The session is the bot's cookie (`/api/v1/session`); every write sends the CSRF token it returns as
`X-CSRF-Token`. When the session runs out, the next request sends you to sign in again.

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

It has no Twitch sign-in; for the moderator view, open `http://127.0.0.1:8080/dev/login-as?user=alice` (a
moderator of `vexoulz`; `newcomer` is a plain user), then this site at `http://127.0.0.1:5176/manage`: the session cookie belongs to the host,
so use `127.0.0.1` for both, not `localhost`.

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

## Assets still needed

Stand-ins (`VxPlaceholder`) until the real files exist:

- **Twitch mark** (16px, for dark backgrounds) on the header's Manage button, `src/components/ManageLink.vue`.
