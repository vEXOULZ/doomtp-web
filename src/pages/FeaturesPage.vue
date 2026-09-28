<script setup lang="ts">
import { VxSkeleton } from '@vexoulz/ui'
import { computed } from 'vue'
import ChatLine from '@/components/ChatLine.vue'
import Cmd from '@/components/Cmd.vue'
import DtpShell from '@/components/DtpShell.vue'
import { api } from '@/lib/api'
import { defaultSign } from '@/lib/site'
import { useLoad } from '@/lib/useLoad'

const p = computed(defaultSign)
const { data: roles } = useLoad(() => api.roles())
// Lines of chat for a code block, each starting with the sign. `# …` comments stay plain text.
const lines = (...rest: string[]) => rest.map((l) => `${p.value}${l}`)

// Blocks with quotes and backslashes in them, kept out of the template.
const customBlock = computed(() =>
  lines(
    'cc add hype echo {$chatter.display} is hyped!',
    'cc param hype 1 name=target type=user "who to hype"',
    'cc describe hype gets the chat hyped',
    'cc publish hype          # a moderator offers it to the channel',
  ),
)
const publishReply = computed(() =>
  [
    `${p.value}cc publish count`,
    `> published "count" (by @you) as ${p.value}count here. Mods can ${p.value}cc disable count.`,
    '> ⚠ count writes channel.deaths — those writes are denied until a mod allows them:',
    `>   ${p.value}cc grant count channel.deaths.`,
  ].join('\n'),
)
const triggerBlock = computed(() =>
  lines(
    'trigger add raid echo welcome {event.user.name} and {event.viewers} raiders!',
    String.raw`trigger listen \bhello\b echo hi {$chatter.display}`,
    'timer add 15m min_lines=10 jitter=2m echo remember to hydrate',
    'timer cron "0 18 * * fri" echo the stream starts now',
  ),
)
const filterBlock = computed(() =>
  lines(
    'filter add word badword           # masks it: ****',
    'filter add word slur tag insult   # replaces it with [insult]',
    String.raw`filter add regex \d{9,} block     # blocks the whole message`,
    'filter add allow scunthorpe       # an exception, for the obvious reason',
    'filter test some text here',
  ),
)
const actBlock = computed(() =>
  lines(
    'timeout @spammer 1h links again   # the reason shows who asked',
    "shoutout @friend                  # where to find them, and Twitch's card while live",
  ),
)

const TOC = [
  ['commands', 'Commands and pipelines'],
  ['permissions', 'Roles and permissions'],
  ['cooldowns', 'Cooldowns'],
  ['toggles', 'Turning things on and off'],
  ['custom', 'Custom commands'],
  ['packs', 'Packs and derived commands'],
  ['variables', 'Variables'],
  ['triggers', 'Triggers, listeners and timers'],
  ['filter', 'Word filter'],
  ['moderation', 'Moderation-aware replies'],
  ['logging', 'Chat log and history'],
  ['quotes', 'Quotes'],
  ['channels', 'Channels and onboarding'],
  ['explain', 'Explaining an expression'],
  ['api', 'API and admin'],
]

function roleSource(name: string): string {
  if (['broadcaster', 'moderator', 'vip', 'subscriber'].includes(name)) return 'Twitch badges'
  if (name === 'everyone') return 'everyone in chat'
  if (name === 'bot_admin' || name === 'bot_owner') return "the bot's own admin list"
  return 'custom, created per channel'
}
</script>

<template>
  <DtpShell>
    <article class="doc">
      <h1 class="vx-display">Features</h1>
      <p class="vx-muted">
        What the bot does, how each part behaves, and where the limits are. Examples use
        <code>{{ p }}</code> as the command sign; your channel may use another.
      </p>

      <nav class="toc vx-panel" aria-label="On this page">
        <a v-for="[id, label] in TOC" :key="id" :href="`#${id}`">{{ label }}</a>
      </nav>

      <h2 id="commands" class="vx-display">Commands and pipelines</h2>
      <p>A command is one step. Operators join steps into a line, and only the <em>last</em> result is sent to chat.</p>
      <div class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>Operator</th><th>Meaning</th><th>Example</th></tr></thead>
          <tbody>
            <tr><td><code>|</code></td><td>Pipe: the left result becomes the right command's input. Stops if the left fails.</td><td><ChatLine :lines="`${p}random 1-6 | echo you rolled {_1}`" :sign="p" /></td></tr>
            <tr><td><code>&amp;&amp;</code></td><td>Run the right side only if the left succeeded.</td><td><ChatLine :lines="`${p}var incr channel.deaths && echo oof`" :sign="p" /></td></tr>
            <tr><td><code>||</code></td><td>Run the right side only if the left failed. This is how you handle errors.</td><td><ChatLine :lines="`${p}quote {arg.1} || echo no such quote`" :sign="p" /></td></tr>
            <tr><td><code>( )</code></td><td>Grouping, so an operator applies to a whole section.</td><td><ChatLine :lines="`( ${p}a || default 5 ) -> channel.x`" :sign="p" /></td></tr>
            <tr><td><code>-&gt;</code> and <code>--&gt;</code></td><td>Store the result in a variable; <code>--&gt;</code> appends to a list. Only on success.</td><td><ChatLine :lines="`${p}random 1-100 -> chatter.luck`" :sign="p" /></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Results carry three things:</strong> an exit code, a message (what chat sees) and data (structured values
        other commands can read as <code>{_1}</code>, <code>{_1[celsius]}</code>). Failure codes are documented in the
        <RouterLink to="/docs/language">language reference</RouterLink>.
      </p>
      <p>
        A line runs at most <strong>8 commands</strong>, and nothing runs at all if any part of it fails a check first:
        a line either goes through as a whole or does nothing.
      </p>

      <h2 id="permissions" class="vx-display">Roles and permissions</h2>
      <p>Roles are ranked. A command requires a role, and anyone whose rank reaches it may run the command.</p>
      <div v-if="!roles" class="loading" aria-busy="true"><VxSkeleton v-for="i in 5" :key="i" h="26px" /></div>
      <div v-else class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>Role</th><th>Rank</th><th>Comes from</th></tr></thead>
          <tbody>
            <tr v-for="r in roles.roles" :key="r.name"><td><code>{{ r.name }}</code></td><td class="vx-tabular">{{ r.rank }}</td><td>{{ roleSource(r.name) }}</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Channels can add their own roles between {{ roles?.custom_rank_range[0] ?? 1 }} and {{ roles?.custom_rank_range[1] ?? 99 }}
        (<Cmd t="role create ambassador 40" />) and grant them with <Cmd t="role add ambassador @someone [duration]" />.
        A role above moderator (a lead moderator, say) is just a higher rank.
      </p>
      <p>
        Change what a command needs with <Cmd t="perm set <command> <role>" />, or allow exactly one role regardless of
        rank with <Cmd t="perm allow" />.
      </p>
      <p class="vx-muted">
        A denial is silent. The bot doesn't announce that you can't use something; a channel can configure an
        <code>on_denied</code> callback if it wants a reply.
      </p>

      <h2 id="cooldowns" class="vx-display">Cooldowns</h2>
      <p>Every command has <strong>two</strong> cooldowns, and both must be clear before it runs:</p>
      <ul>
        <li><strong>Shared</strong>: one bucket for everyone at the same role tier.</li>
        <li><strong>Personal</strong>: your own bucket.</li>
      </ul>
      <ChatLine :lines="lines('cooldown set random everyone 10 30   # 10s shared, 30s personal', 'cooldown show random')" :sign="p" block />
      <p>
        The tier that applies is the highest-ranked rule your rank reaches, so a moderator can be exempt while viewers
        wait. Being on cooldown is silent, with an optional <code>on_cooldown</code> callback.
      </p>
      <p>
        A command on cooldown fails like any other failure, at the moment the line reaches it. So <code>||</code> can
        route around it, and a command the line never reaches is never held to its cooldown:
      </p>
      <ChatLine :lines="lines('random 1-6 || echo the dice are resting   # the echo runs while random is on cooldown')" :sign="p" block />
      <p>A command used twice in one line meets its own cooldown the second time, unless that cooldown is zero.</p>

      <h2 id="toggles" class="vx-display">Turning things on and off</h2>
      <p>Commands are grouped into modules. A channel can switch a whole module or a single command:</p>
      <ChatLine :lines="lines('module list', 'module disable games', 'cmd disable roll', 'cmd log roll invocations     # how much of its use is written to the log')" :sign="p" block />
      <p>
        Bot admins can add <code>global</code> to any of those to set the default everywhere. A globally disabled command
        can't be re-enabled by a channel: that's the kill switch. A disabled command answers exactly like an unknown one,
        so it doesn't leak that it exists.
      </p>

      <h2 id="custom" class="vx-display">Custom commands</h2>
      <p>Anyone can build a command out of the pieces above:</p>
      <ChatLine
        :lines="customBlock"
        :sign="p"
        block
      />
      <div class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>What</th><th>How</th></tr></thead>
          <tbody>
            <tr><td>Use your own</td><td>Immediately, anywhere the bot is: it's your personal alias.</td></tr>
            <tr><td>Share</td><td><Cmd t="cc share hype on" />, then others <Cmd t="cc link @you hype" /></td></tr>
            <tr><td>Offer to a channel</td><td><Cmd t="cc publish" /> (moderator by default)</td></tr>
            <tr><td>Change it</td><td><Cmd t="cc edit" />, <Cmd t="cc revert" />, <Cmd t="cc versions" /></td></tr>
            <tr><td>Stop it</td><td>Mods: <Cmd t="cc disable" /> / <Cmd t="cc unpublish" />. Owner: <Cmd t="cc rm" /></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Edits are live.</strong> When you edit a command, every channel and every person using it gets the new
        version immediately. There is no pinning and no approval step, so linking or publishing someone else's command
        always answers with a warning saying exactly that. A channel isn't left guessing: <Cmd t="cc info" /> says when a
        command changed since the version this channel last ran, and a channel that turns edit notices on hears it in
        chat the first time a run picks the change up.
      </p>
      <p>
        <strong>A custom command runs as whoever typed it.</strong> Commands inside it are checked against their
        permissions, their cooldowns and their rank, never the author's. Publishing something can't hand anyone new
        powers.
      </p>
      <p>
        Names resolve in this order: <strong>built-in → published in this channel → a pack published here → published
        globally → your personal alias</strong>. <Cmd t="@name" /> addresses your own alias directly, and a built-in can
        never be shadowed.
      </p>
      <p>
        When a name won't reach it (nothing is published yet, or a built-in has the name), run it by its id:
        <Cmd t="cc run cc_7f3k2 arg1 arg2" />. That works for your own commands and for any shared one, and only when
        you type it in chat, never from inside another command.
      </p>

      <h2 id="packs" class="vx-display">Packs and derived commands</h2>
      <p>
        A <strong>pack</strong> is a set of commands that belong together (a game, a toolkit), published and unpublished
        as one unit:
      </p>
      <ChatLine :lines="lines('cc pack create blackjack', 'cc pack add blackjack hit stand deal', 'cc publish pack blackjack', 'module disable blackjack     # the pack name is its module name')" :sign="p" block />
      <p>
        Commands added to a pack later appear in every channel that published it, for the same reason edits are live: a
        channel accepted <em>the pack</em>, and the owner decides what's in it. Publishing refuses, and changes nothing,
        if one of the names is already taken in that channel.
      </p>
      <p>
        A <strong>derived command</strong> is a custom command published globally by a bot admin, so it works in every
        channel without being published one by one. Built-ins (written in Python) are <em>primitive</em>; derived
        commands are written in this language and can be fixed live. A channel can always override a derived command
        with its own, or switch it off.
      </p>
      <p>This bot ships a <strong>starter</strong> pack of them, owned by the bot's own account:</p>
      <div class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>Command</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><Cmd t="hug [user]" /></td><td>Hug someone, or the whole chat</td></tr>
            <tr><td><Cmd t="lurk" /></td><td>Say you're still around, quietly</td></tr>
            <tr><td><Cmd t="roll [1-6]" /></td><td>Roll a die (1-20 by default)</td></tr>
            <tr><td><Cmd t="so <streamer>" /></td><td>Shout out another streamer</td></tr>
            <tr><td><Cmd t="deaths" /></td><td>Count the deaths of the run</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        <Cmd t="cc info hug" /> shows the body of any of them: they're ordinary commands. Turn the set off with
        <Cmd t="module disable starter" />, or one of them with <Cmd t="cmd disable hug" />. <Cmd t="deaths" /> writes a
        channel variable, so it stays quiet until a mod allows it once: <Cmd t="cc grant deaths channel.deaths" />.
      </p>

      <h2 id="variables" class="vx-display">Variables</h2>
      <p>Values the bot remembers, in seven namespaces:</p>
      <div class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>Namespace</th><th>Belongs to</th></tr></thead>
          <tbody>
            <tr><td><code>chatter.x</code></td><td>you, everywhere the bot is</td></tr>
            <tr><td><code>channel.x</code></td><td>the channel</td></tr>
            <tr><td><code>channel.chatter.x</code></td><td>you, in this channel</td></tr>
            <tr><td><code>publisher.x</code></td><td>the custom command's author</td></tr>
            <tr><td><code>publisher.chatter.x</code></td><td>you, for that author's commands</td></tr>
            <tr><td><code>publisher.channel.x</code></td><td>that author, in this channel</td></tr>
            <tr><td><code>publisher.channel.chatter.x</code></td><td>you, for that author, in this channel</td></tr>
          </tbody>
        </table>
      </div>
      <ChatLine :lines="lines('var set chatter.location Lisbon', 'var incr channel.deaths', 'var top channel.chatter.points', 'echo 1 -> channel.deaths')" :sign="p" block />
      <p>
        <strong>Who may write what</strong> is the safety boundary for shared commands. Your own commands may write your
        spaces; a published command written by someone else may write <em>their</em> spaces, and may only touch the
        channel's if a moderator granted exactly that variable:
      </p>
      <ChatLine :lines="[`${p}cc grant points channel.chatter.points   # and ${p}cc revoke to take it back`]" :sign="p" block />
      <p>
        A grant follows the command, not the name it was published under, and it survives the author's future edits,
        which the reply says when you grant it. Unpublishing takes the grants with it.
      </p>
      <p>
        You don't have to spot the missing grants yourself. Publishing reads the body and names the writes that are still
        denied, with the command to allow the first one; <Cmd t="explain" /> says the same about any expression you're
        about to run:
      </p>
      <pre class="vx-code">{{ publishReply }}</pre>
      <p class="vx-muted">All variables are readable by anyone. Don't store anything private in them.</p>

      <h2 id="triggers" class="vx-display">Triggers, listeners and timers</h2>
      <ChatLine
        :lines="triggerBlock"
        :sign="p"
        block
      />
      <ul>
        <li>
          <strong>Triggers</strong> run on channel events. The payload is in <code>{event.*}</code>, and the chatter is
          the event's user: the raider, the subscriber.
        </li>
        <li>
          <strong>Listeners</strong> run on ordinary chat lines matching a regular expression, with captures in
          <code>{match.1}</code> and <code>{match.name}</code>.
        </li>
        <li>
          <strong>Timers</strong> run on a clock. <code>jitter=</code> spreads them out, <code>min_lines=</code> keeps
          them quiet in a quiet channel, and <code>only_live</code> waits for the stream to be live.
        </li>
        <li>
          <strong>Crons</strong> run at named times instead of intervals: <code>minute hour day month weekday</code>, in
          the channel's own timezone. <code>0 18 * * fri</code> is Friday at six, <code>*/15 * * * *</code> is every
          quarter hour, <code>30 9 * * mon-fri</code> is weekday mornings. They take the same <code>only_live</code> and
          <code>min_lines</code> conditions.
        </li>
      </ul>
      <p>
        All three run at the rank of the moderator who created them, never higher, and go through the same checks as a
        typed command.
      </p>
      <p class="vx-muted">
        Raids, subs, resubs, gift subs and the stream going on or off air work in every channel. Follows need the bot to
        be a moderator; channel point redemptions and cheers need the broadcaster to connect the channel. A trigger for
        those can still be created: adding it says which permission is missing, and it starts working the moment the
        channel grants it.
      </p>

      <h2 id="filter" class="vx-display">Word filter</h2>
      <ChatLine
        :lines="filterBlock"
        :sign="p"
        block
      />
      <p>
        Matching ignores the usual tricks: case, accents, zero-width characters, full-width letters, leetspeak
        (<code>b4d</code>), repeated letters (<code>baaaad</code>) and separators (<code>b a d</code>,
        <code>b.a.d</code>). Regular expressions match the text as typed, so digits and punctuation still mean what they
        say.
      </p>
      <p>
        The filter applies to <strong>everything the bot says</strong>, and to <strong>what people store</strong>:
        custom command names and bodies, variable values and trigger expressions are rejected rather than saved. Bot
        admins keep a global list that applies in every channel.
      </p>
      <h3>Acting on incoming chat</h3>
      <ChatLine
        :lines="lines('automod                 # what it does today', 'automod delete          # delete messages a `block` entry matches', 'automod timeout 600     # …and time the chatter out for ten minutes', 'automod test some text  # what would happen, without doing it', 'automod off')"
        :sign="p"
        block
      />
      <p>
        This is off in every channel until a moderator turns it on, and it needs the bot to be a moderator there. Only
        <code>block</code> entries count: <code>mask</code>, <code>replace</code> and <code>tag</code> change what the
        <em>bot</em> says and never cost a chatter their message. Moderators and the broadcaster are never actioned:
        quoting a word to talk about it is part of moderating.
      </p>

      <h2 id="moderation" class="vx-display">Moderation-aware replies</h2>
      <p>
        If the message that triggered a command is deleted, or its author is timed out or banned while the bot is still
        working, the run is cancelled and nothing is sent. The check runs before each command, before any side effect,
        and again immediately before sending. A channel can add <code>reply_hold_ms</code> to delay replies slightly,
        giving moderators a moment to act first.
      </p>
      <h3>Acting as the bot</h3>
      <ChatLine :lines="actBlock" :sign="p" block />
      <p>
        Both are for moderators and need the bot to be a moderator in the channel. They act when their stage runs, and
        the moderation check comes right before Twitch is asked. Nobody at or above your own rank can be timed out this
        way, and <Cmd t="explain --run" /> never runs either.
      </p>

      <h2 id="logging" class="vx-display">Chat log and history</h2>
      <p>
        Every message is written to a searchable log (full-text). <strong>Nothing is ever deleted:</strong> a deleted
        message keeps its row and gains a deletion time, so the record of what happened stays honest. Timeouts, bans and
        chat clears are stored as events of their own.
      </p>
      <p>
        Coverage is recorded too: the log knows exactly when the bot was listening. If the bot was down, the gap can be
        filled from the public recent-messages service when a channel opts in, and anything that can't be proven complete
        is marked partial rather than quietly called whole. <strong>Backfilled messages never run commands</strong>:
        they only go to the log.
      </p>
      <p>Opting in is the broadcaster's call and nothing happens until they make it:</p>
      <ChatLine :lines="lines('backfill          # what it is, and which service would be asked', 'backfill on       # broadcaster only')" :sign="p" block />
      <h3>Searching it from chat</h3>
      <ChatLine :lines="lines('logsearch speedrun          # the newest message saying it, and how many more', 'logsearch @alice speedrun   # …from one chatter')" :sign="p" block />
      <p>
        For moderators, unless a channel opens it up. Chat only ever sees what is still in chat: deleted messages, those
        of chatters timed out or banned since, and the bot's own lines never come back this way.
      </p>

      <h2 id="quotes" class="vx-display">Quotes</h2>
      <ChatLine
        :lines="lines('quote                     # a random one', 'quote 12                  # that one', 'quote meant               # the newest saying it', 'quote add I meant to do that   # moderators; remembers the game when live', 'quote del 12              # moderators')"
        :sign="p"
        block
      />
      <p>
        A quote keeps its number for good: deleting #12 leaves #12 empty rather than moving #13 into its place, so a
        number said on stream still means the same quote. Quotes go through the word filter before they are kept, and
        adding and deleting show in the audit log.
      </p>

      <h2 id="channels" class="vx-display">Channels and onboarding</h2>
      <p>
        A broadcaster types <Cmd t="join" /> in the bot's own chat, and the bot starts reading and replying in theirs, no
        authorization needed for that. More becomes possible as trust grows:
      </p>
      <div class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>Tier</th><th>What unlocks it</th><th>What it adds</th></tr></thead>
          <tbody>
            <tr><td>basic</td><td>nothing, just <Cmd t="join" /></td><td>reading chat, replying, commands, timers, crons, stream on/off</td></tr>
            <tr><td>moderator</td><td>the broadcaster mods the bot</td><td>follow events, moderation detail, higher send limits, no slow mode</td></tr>
            <tr><td>full</td><td>the broadcaster connects the bot</td><td>channel point redemptions, sub and cheer events, the chat bot badge</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The first two need nothing from the bot's owner. The third is a link the broadcaster follows once
        (<a href="/auth/connect">/auth/connect</a> on this site), where Twitch asks whether they want to give the bot
        their channel point redemptions, subscriptions and cheers. They can grant some and refuse the rest: what they
        grant is what turns on, and the rest keeps saying why it is off. It is taken back the same way, from
        <em>Connections</em> in their Twitch settings.
      </p>
      <p>
        The bot works out which tier it has by itself: it checks when it joins and again every hour, and that answer is
        what <Cmd t="help" />, <Cmd t="explain" /> and the admin pages report. Whether a channel is live comes from
        Twitch once a minute, which is what <code>only_live</code> and the <code>stream_online</code> trigger read.
      </p>
      <p><Cmd t="part" /> removes the bot; it stops listening and sending immediately.</p>

      <h2 id="explain" class="vx-display">Explaining an expression</h2>
      <ChatLine :lines="[`${p}explain ${p}random 1-6 | echo you rolled {_1}`, `${p}explain --run ${p}ping`]" :sign="p" block />
      <p>
        The same report is on the <RouterLink to="/docs/language#try">language page</RouterLink>, in an editor that
        colours what you type, underlines the exact error a chat user would get, and completes command names,
        placeholders and types from the bot itself. Nothing there runs or is sent to chat.
      </p>
      <p>
        Shows how each name resolved (built-in, published, or your alias, with the author and version), your rank
        against what each command requires, both cooldowns with the time remaining, which placeholders exist in that
        context, and the first check that would fail. <code>--run</code> also evaluates it, with variable writes
        discarded, cooldowns untouched and nothing sent to chat.
      </p>

      <h2 id="api" class="vx-display">API and admin</h2>
      <div class="table-scroll">
        <table class="vx-table">
          <thead><tr><th>Endpoint</th><th>What it gives</th></tr></thead>
          <tbody>
            <tr><td><code>GET /api/v1/commands</code></td><td>every built-in with usage, parameters and examples</td></tr>
            <tr><td><code>GET /api/v1/language</code></td><td>operators, placeholder roots per context, types, limits</td></tr>
            <tr><td><code>POST /api/v1/parse</code></td><td>the AST, or the error with its code, column and hint</td></tr>
            <tr><td><code>POST /api/v1/explain</code></td><td>the same report as <Cmd t="explain" /></td></tr>
            <tr><td><code>GET /healthz</code>, <code>GET /readyz</code></td><td>liveness, and readiness with component detail</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The full list is in the <RouterLink to="/docs/api">API reference</RouterLink>. The admin side shows health, channels, and every channel's
        modules, triggers, filters, published commands and ignore list, with an audit trail of configuration changes. It
        needs the admin password.
      </p>
      <p>
        The <RouterLink to="/docs/commands">command reference</RouterLink> and every channel page use the same table: one
        line per command, a search box that narrows it as you type (by name, alias, module, author or body text), and a
        click on any line for its arguments, cooldowns and examples. Press <kbd>Esc</kbd> in the box to clear it.
      </p>
    </article>
  </DtpShell>
</template>

<style scoped>
.toc { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 4px 16px; padding: 12px 16px; margin: 16px 0 8px; font-size: 14px; }
.loading { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
kbd { font-family: var(--vx-font-mono); font-size: 0.85em; padding: 0 4px; border: 1px solid var(--vx-line); border-radius: 4px; }
</style>
