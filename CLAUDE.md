@.conventions/CLAUDE.md

# doomtp-web

dtp.vexoulz.net: doomtp-bot's docs, command reference, channel pages and chat's explain reports, over the
bot's JSON API, on the shared `@vexoulz/ui` design. Published by `publish.yml` to the `deploy` branch.

- Data comes only from the bot's JSON API. Anything missing is asked for in doomtp-bot, not scraped or
  guessed here. In production the site shares an origin with the bot.
- Dev server (`.claude/launch.json` `dtp-dev`, :5176) proxies the bot's paths to a local bot API: run
  doomtp-bot's `scripts/dev_api.py` with its `postgres-test` compose service up (README "The bot, same
  origin").
- Signing in uses vexoulz-auth through `@vexoulz/ui/account`; `VITE_AUTH_BASE` in `.env.local` points a
  dev server at a local auth.
- Controls use the fixed heights (32px / 26px small) and the header stays 48px.
