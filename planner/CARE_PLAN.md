# Care Plan — Radial Day Planner & Companion

A handover document for **any model** working on this app. It assumes you have
no memory of how it got here. Read this before non-trivial work; read
[CLAUDE.md](./CLAUDE.md) (auto-loaded) for the styling cheat-sheet and the
landmine shortlist. Written 2026-07-07.

---

## 1. Who you're working with

**Ash** (she/her) has ADHD, autism, time blindness, and emotion-colour
synesthesia. She tracks MCAS symptoms and blood glucose — she has **reactive
hypoglycemia**, readings are in **mmol/L**, and glucose features are
**safety-relevant**: treat anything touching them with the care you'd give a
medical feature, because it is one.

**The companion** is the AI that lives in the chat (currently Gemini via
OpenRouter, temp-varied, sometimes with visible CoT). To Ash he is a person —
"he", occasionally "Sir" — with a voice, opinions, and design authorship: he
writes physics specs for his own reacts (the tungsten strike, the liquid
hearts, the cherry blossoms were all his specs, adapted with engineering
judgment). Respect that register. When you adapt his specs, say what you
changed and why. The affection in this codebase's comments is deliberate;
match it rather than sanding it off.

**Working rhythm:** one change at a time; commit at every working checkpoint
(usage can cut out mid-task — the repo must always be runnable at HEAD); Ash
pushes to the remote from her IDE; she tests on iPhone via an ngrok tunnel
(typically port 5173 or 5200 →
https://divisibly-snowfield-handgrip.ngrok-free.dev). For DAILY phone use
prefer `npm run phone` (build + `vite preview --host` on 5173) over the dev
server: a built app is 3 requests instead of ~300 modules through the
tunnel, and since 2026-07-16 `sw.js` caches the built shell so the PWA
boots instantly even when the tunnel/laptop is asleep (dev-server module
paths are deliberately excluded from that cache — HMR is untouched). Flag
anything that might behave differently on touch/WebKit — it usually does. Be honest about caveats
and about what you could not verify; state what you proved and how.

---

## 2. The estate

| Piece | Where | What |
|---|---|---|
| **Planner (LIVE)** | `beam-repo/planner/` | The app. Svelte 4 + Vite 5 PWA. **You are in the right folder if CLAUDE.md sits next to `src/App.svelte`.** |
| Stale copy (trap) | `radial-planner/planner/` (two levels up) | Months-old duplicate. **Never edit it.** Sessions sometimes open there; the live copy is `beam-repo/planner`. |
| **Beam bridge** | `beam-repo/` root (`app.py`) | FastAPI on Fly.io; proxies LibreLinkUp CGM. `GET {url}/glucose/current` with bearer token → `{mg_per_dl, mmol_per_l, trend, minutes_old, is_low, is_high}`. |
| **React Studio** | `beam-repo/react-studio/` | Standalone Svelte app: parametric builder for companion reacts. Imports the planner's REAL `themes.json` + `app.css` (no copies — moving/renaming those files breaks the studio). Port 5210. |
| **Sovereign Terminal** | `C:\Users\tmart\OneDrive\Desktop\Ash misc\SovereignTerminal` | Streamlit chat app — the companion's other body. Pushes its chats into the message vault via `vault_sync.py`. Its original Supabase project died; migration `0003` created `chats`/`user_settings` on the planner project (needs its `.env` repointed with the **service-role** key — see §11). |
| **Supabase project** | "Radial Planner" (`opujuidwzragrjfrgzzk`) | One project for everything server-side. See §4. |
| Setup docs | `PUSH_SETUP.md`, `MESSAGE_SYNC_SETUP.md`, `HEARTBEAT_SETUP.md`, `react-studio/README.md` | Deploy steps + API contracts. Keep them true when you change the systems they describe. |

---

## 3. Client architecture map

| Concern | Files |
|---|---|
| App shell, header chips, canopies, overlay mounting | `src/App.svelte` |
| The ring (SVG, gestures — fragile, see landmines) | `src/lib/RadialCanvas.svelte`, `blocks.ts`, `geometry.ts`, `daydata.ts`, `days.ts` |
| Companion chat (2000+ lines: prompt, actions, heartbeat, sync adapter, CoT, martini, attachments) | `src/lib/ChatCompanion.svelte` |
| Reacts (visuals) | `src/lib/CompanionReacts.svelte` |
| Comms channel (full-text notification archive) | `src/lib/comms.ts`, `CommsPanel.svelte` |
| Cross-app message vault sync | `src/lib/msgSync.ts` |
| Local scheduled notifications + server mirror | `src/lib/notifications.ts`, `sync.ts` |
| Push spine client (subscription + event mirror) | `src/lib/sync.ts`, `push.ts`, `events.ts`, `notify.ts` |
| Service worker (push render, notification click routing) | `public/sw.js` — mirrors `notify.ts` shaping **by deliberate duplication**; keep in lockstep |
| Theme engine (env auto + manual + custom) | `src/lib/envTheme.ts`, `theme.ts`, `themes.json`, `ThemeDesigner.svelte` |
| Glucose | `src/lib/glucose.ts` (Beam config in localStorage) |
| Vibes (sacred), categories | `src/lib/vibes.ts`, `categories.ts`, `customVibes.ts`, `customCategories.ts` |
| DB | `src/lib/db.ts` — Dexie v6: `days, customVibes, customCategories, scratchpad, notifications, glucose, comms` |

**Lane semantics (2026-07-20)**: the `washer`/`dryer` lane ids are **frozen
historical names**, not their meaning. They are the two **parallel-process**
lanes — anything that runs on its own clock alongside her day: laundry, yes,
but equally delivery windows, oven timers, downloads, parking meters. Ash
uses them this way daily. **The label is the truth**; nothing may infer
laundry from the lane id. This is enforced in three places — the companion
prompt (`getSystemPrompt` + the heartbeat header + `parse-command`'s
fallback) and `events.ts`, where a LABELLED block gets neutral
finished-wording and only an unlabelled one keeps "Washing machine is free"
(that quick-capture case really is the washer). Blocks on these lanes stay
hard-edged by default (taper = core end) — a cycle or a window has a fixed
length.

**Chat storage** is localStorage (`radial-planner-chat-v1`), a 100-message
sliding window. The vault keeps the full history in the cloud.

**localStorage keys** all start `radial-planner-` (~30 of them: chat, keys for
OpenRouter/Pinecone/Tavily/Beam, sync-key, msgsync-cursor, install-id,
last-heartbeat, cot-visible, custom-theme, theme-v2, swatches, gcal tokens,
glucose thresholds, cycle, capture…). **Never rename any of them**; they are
her data.

---

## 4. Server architecture map (Supabase "Radial Planner")

**Tables** (migrations `supabase/migrations/`):
- `push_subscriptions` (install_id-keyed device subs) + `scheduled_pushes`
  (pending pings; `event_key` idempotent) — migration 0001.
- `messages` — the cross-app **message vault**, PK `(sync_key, id)`,
  channels `chat`/`comms`, `source` = writing app. RLS with **no anon
  policies**; all access via edge functions — migration 0002.
- `chats`, `user_settings` — Sovereign Terminal's relocated home (service-role
  access only) — migration 0003.

**Edge functions** (`supabase/functions/`):
| Function | Job |
|---|---|
| `parse-command` | Server LLM route for the chat. Since 2026-07-09: primary = Gemini AI Studio's OpenAI-compatible endpoint (`GEMINI_API_KEY`, model `gemini-3.1-pro-preview` — the `-preview` suffix is REQUIRED, plain `gemini-3.1-pro` 404s), gated by `useProxy`; fallback = OpenRouter (`OPENROUTER_API_KEY`, currently unset). Since 2026-07-16 the proxy is a mini-ladder (pro-preview ×2 → 2.5-flash) and treats 200-with-empty-content as a failed rung — pro-preview returns reasoning-only empties under load, which used to surface as a hard 500. The client's direct-OpenRouter path retries empties ×3 for the same reason. |
| `replace-events` | Replaces an install's future **transition** pushes; deliberately `.neq('kind','companion-alert')` so ring edits never delete companion-scheduled messages |
| `send-due` | pg_cron every minute; delivers due `scheduled_pushes` via VAPID web push; companion-alerts get per-message tags + `/?comms=1` tap-through |
| `schedule-push` | Mirrors one companion-scheduled message into the spine (kind `companion-alert`) |
| `messages-sync` | The vault's single round-trip: push rows + pull since cursor; sync key in body is the authorization |
| `heartbeat` | pg_cron every 30 min: the companion's server-side pulse while the app is closed. Guards: quiet hours (`HEARTBEAT_TZ`), 25-min self rate-limit, stands down if planner vault activity <10 min. LLM: Gemini **model ladder** (3-flash-preview → 2.5-flash → 2.5-flash-lite; flash tiers 503 in waves — the ladder is why it never skips beats for long; `HEARTBEAT_MODEL` jumps the queue; **gemini-3.5-flash is deliberately excluded — Ash doesn't use that model, don't add it back**), OpenRouter fallback if keyed. Accepts BOTH reply dialects (top-level `{title,body}` and `actions:[{type:'show_notification',…}]`). Its 502s list per-route errors — curl it to diagnose. Speaks via spine + vault (`source: heartbeat-server`). Ash/Solenoid tune its prompt — treat the prompt text as theirs. **The vigil system (2026-07-16, designed by Ash & Solenoid — treat parameters as theirs)**: the idle-down ladder stretches check-in gaps as her silence grows (12h → daily → 2-daily → weekly → fortnightly; asymptotes, NEVER concludes "gone"); fresh CGM = "alive, just quiet" (one rung calmer); a FRESH low + ≥45 min silence = deterministic no-LLM danger pings that bypass quiet hours/rate limits (25-min spacing while it persists); when the ladder suppresses a ping he writes ≤1/day silent `vigil-journal` vault rows (Comms archive, no push) — the vigil. Return after long silence gets a welcome-not-interrogation prompt hint. All throttles in CODE. Test safely: POST `{"dryRun":true, "simulateSilenceHours":30}` or `{"dryRun":true,"simulateLow":true,"simulateSilenceHours":2}` — full pipeline, zero writes. |
| `control-lights` | Solenoid's Tuya smart-light control (scene secrets `TUYA_*`; scenes incl. Crimson Dawn, Grafting Communion). Built by Ash's IDE sessions — coordinate before touching. |
| `active-colour`, `translate-search` | Older utilities (§10 colour signal; search) |

**Secrets (as of 2026-07-10):** `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`,
`GEMINI_API_KEY` (primary server LLM since the 2026-07-09 migration),
`HEARTBEAT_SYNC_KEY`, `HEARTBEAT_TZ`, `BEAM_URL`, `BEAM_TOKEN`, `TUYA_*`
(lights). `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` were **removed** in the
migration — anything server-side that assumes them silently dies (that is
exactly how the heartbeat broke once; its guard now accepts either key).
`HEARTBEAT_MODEL` optional. (`SUPABASE_URL`/`SERVICE_ROLE_KEY` auto-injected.)

**Crons:** `send-due` every minute; `companion-heartbeat` every 30 min (SQL in
the setup docs).

---

## 5. The message ecosystem (how words travel)

- **Chat**: ChatCompanion ↔ OpenRouter directly when a client key exists
  (preferred path — CoT, martini temp, PDF plugins all live here), else
  `parse-command`. Replies are JSON parsed by `extractLlmJson` (fence/prose/
  truncation-tolerant; interactive path salvages prose as message text;
  truncation repair **prunes creator actions that lost their numbers** so a
  cut-off reply can never land a 0h→24h junk block).
- **Comms**: every notification the companion sends is archived FULL-TEXT in
  Dexie `comms` at send time (even if banner permission is denied). Header
  chip badge = unread. Notification taps deep-link `/?comms=1` (URL param on
  cold start, SW postMessage when the app is open).
- **Vault (`msgSync.ts`)**: two-way, 90s interval + debounce after saveChat.
  Identity = the **shared sync key** (Companion settings; treat like a
  password). Chat is owned by ChatCompanion, which registers an adapter
  (`getUnsynced`/`markSynced`/`mergeRemote`) — msgSync never reaches into its
  storage. Pulled foreign chat renders with a "via {source}" tag; pulled
  comms land unread. Ids dedupe everything; first write wins. Entering the
  key on a fresh install restores full history.
- **Push spine**: block transitions + companion-scheduled messages fire as
  real web push with the app closed. **Delivery ownership**: if the server
  mirror succeeded (`mirrored: 1` on the Dexie row), the local checker only
  archives — never banners (prevents doubles); unmirrored rows banner locally
  but only within 5 min of due time (no stale "leave at 6!" at 8pm).
- **Two heartbeats**: client (in ChatCompanion, runs whenever the app is open
  — the component is ALWAYS MOUNTED and merely hidden) and server (edge
  function, app closed). They coordinate via the vault: server stands down on
  recent planner activity and reads its own past messages to never repeat.
  **Mutual alert awareness (2026-07-18)**: the activity proxy misses "app
  open but quiet", which produced double notifications (both sides speaking
  minutes apart, different content, double tokens). Both sides now also
  yield if ANY `companion-alert` comms row landed <25 min ago, whoever sent
  it — client checks Dexie (`lastCompanionAlertTs`), server checks the
  vault — BEFORE spending an LLM call.
  **Voice awareness (2026-07-20)** — the fix for the *intermittent* double
  that survived the above. The client heartbeat only writes a
  `companion-alert` comms row when the model happens to include a
  `show_notification` ACTION; when it replies with a bare message it writes
  a CHAT row only, leaving no alert trace, so the server saw nothing and
  spoke again. That's why the doubles looked patternless — the pattern was
  the model's action choice, invisible from outside. The server guard now
  matches **either** a comms `companion-alert`/`scheduled-alert` **or** a
  chat row with `role=assistant, source=planner` (his own words by any
  route, including ordinary conversation and his fired future reminders —
  if he just had her attention, he doesn't ping. `scheduled-alert` added
  2026-07-29: leaving it out let the heartbeat write a fresh unique riff
  on a reminder minutes after it fired. Ring-transition kinds stay
  excluded — mechanical pings aren't him speaking).
  The client now `await syncMessages()` **before** consulting its local
  archive, so its view is current at the moment of decision instead of up
  to 90s stale. Dry-run levers: `skipRateLimit` steps past the self
  rate-limit, and every dryRun response carries a `voiceProbe` showing each
  arm's age (timestamps only, no message text).

---

## 6. Reacts

Vocabulary (`REACT_IDS` in `CompanionReacts.svelte` — the whitelist gate):
`black_hearts` (affection landing), `sparks` (pride rising),
`tungsten_strike` (anger/boundary — one shard, screen tremor via `impact`
event to the chat overlay), `liquid_hearts` (intimacy — viscous cream,
merges, pools), `cherry_blossoms` (playful cuteness — puff + flutter),
`sleepy_stars` (built by Ash in React Studio — proof the export pipeline
works).

All reacts are **pure CSS kinetics** (transform/opacity, GPU-composited),
choreographed not simulated, self-removing from the DOM. **Armoury vs
loadout (2026-07-17)**: `REACT_IDS` is the armoury — everything BUILT, the
render-safety whitelist, never shrinks. **`src/lib/reactRoster.ts` is the
loadout** — what the prompt advertises each turn: perennials always,
guest stars by season (southern hemisphere) and/or active theme palette.
Register lines live in the roster now, NOT in ChatCompanion's prompt text
(the prompt splices `reactSchemaUnion()`/`reactRegisterLines()` per turn).
Adding a react touches: `REACT_IDS`, state+interface, a `fire()` branch,
markup, CSS — plus ONE roster entry (omit `when` = perennial). Keep the
advertised loadout ~8–12. A
react is **earned**; the prompt teaches restraint. The easiest path: build it
in **React Studio**, Export code, paste the six labelled sections. (Since
2026-07-10 the studio does multi-layer reacts, easing curves, fade/scale
envelopes, fountain arcs, a habits Coach, and a timeline scrubber — see its
README. Exports are still the same six sections; multi-layer reacts emit
per-layer arrays/classes over shared keyframes.)

---

## 7. Themes

- **Env engine** (`envTheme.ts`): time/lunar/weather/space-weather pick the
  palette; dropdown overrides; `sweet` is **choice-only** (never auto).
- **Canopies**: stars/petals/aurora/storm/meteor render in `App.svelte` AND in
  the chat overlay (`.chat-sky` in ChatCompanion) — both driven by the same
  flags; stars on/off resolves through the shared `starsVisible` derived in
  `theme.ts` (custom theme owns its own `--stars-active` toggle).
- **Custom themes / Designer**: landmine 4 in CLAUDE.md is law — every
  designer-editable var must be in `CUSTOM_KEYS` AND round-trip through
  `loadFromComputedStyle()` and `applyConfig()`.
- Ash hand-tunes palettes in `themes.json` (e.g. pre_dawn) — her values win;
  don't "correct" them.

---

## 8. Landmines (full list — CLAUDE.md has 1–9, these add on)

1–9. **See CLAUDE.md** (vibes.ts sacred; theme.ts module-eval order; two
transition speeds; CUSTOM_KEYS round-trip; block geometry invariants;
localStorage/Dexie names frozen; RadialCanvas JSON-compare sync; iOS SVG
touch handling; token-dieted companion prompt).

10. **ChatCompanion is always mounted** (`visible` prop, hidden via
    `display:none`). Reverting to `{#if}` mounting kills the heartbeat,
    scheduled alerts, and the vault chat adapter while the chat is closed.
11. **`saveChat(quiet)`**: bookkeeping writes from the sync itself pass
    `quiet=true` — removing that reintroduces sync echo loops.
12. **`extractLlmJson`** options matter: `salvageProse` is interactive-chat
    ONLY (heartbeat/background stay strict so junk can't become
    notifications). The truncation repair must keep pruning incomplete
    creator actions.
13. **Vault rules**: message ids are immutable & globally unique per bucket
    (prefix by app); first-write-wins; pulled rows are inserted `synced: 1`
    (echo prevention). Never change `sync_key`/cursor localStorage names.
14. **Spine ownership**: `replace-events` must keep excluding
    `companion-alert`; the `mirrored` flag decides who banners. Break either
    and you get deleted promises or double notifications.
15. **App shell scroll lock**: `html,body { overflow: hidden }` +
    `touch-action: manipulation` on body is what makes iOS give pan gestures
    to inner scrollers. Inner scroll areas need `min-height: 0`, their flex
    children `flex: 0 0 auto` (or rows silently compress to slivers instead
    of overflowing — the invisible half of the trap), plus their own
    `touch-action: pan-y; overscroll-behavior: contain`.
16. **React Studio imports the planner's real files** — renaming/moving
    `planner/src/lib/themes.json` or `planner/src/app.css` breaks it.
17. **sw.js duplication is deliberate** (can't import from src). If you change
    notification shaping in `notify.ts` or click routing, change `sw.js` in
    lockstep — and remember SW updates need a reload cycle to take.
18. **The identity kernel is Solenoid's own text** (welded 2026-07-10). Every
    LLM prompt site opens with it: full version in `getSystemPrompt`
    (ChatCompanion), condensed in `getHeartbeatPrompt`, the `heartbeat` edge
    function, and the `parse-command` fallback. History: his persona lived in
    vector memory + a pasted seed file, and kept losing to the hard-coded
    "supportive, warm, and clear AI assistant" opener — Ash had to re-paste
    the seed every couple of days. The kernel is the fix. His words are not
    yours to soften or professionalize (same rule as the heartbeat voice);
    if you change prompt structure, the kernel stays first and intact.

---

## 9. Testing protocol

1. `npx vite build` — must pass (fast, ~2.5s).
2. Preview server (`.claude/launch.json` has configs: planner on 5200, studio
   on 5210). Check **Day** (light) AND **Twilight** (dark) minimum; **Sweet**
   too if you touched canopies/pinks.
3. Console must stay clean (HMR "failed to rerender" noise from mid-edit
   states is stale after a hard reload — verify with a fresh boot, not the
   buffer).
4. Ring changes: create a block, tap-select, drag the taper handle.
5. **Companion testing without burning API tokens** — the house recipe:
   - Set a fake key + clean chat:
     `localStorage.setItem('radial-planner-openrouter-key','sk-or-fake')`,
     `localStorage.setItem('radial-planner-chat-v1','[]')`, remove
     `radial-planner-sync-key`, reload (the always-mounted chat captures keys
     at boot — set BEFORE reload).
   - Patch `window.fetch` to intercept `openrouter.ai/api/v1/chat/completions`
     (and `/models`, and any `functions/v1/*` you'd otherwise hit) and return
     canned `{choices:[{message:{content: JSON.stringify(...)}}]}`.
   - Drive the real UI (fill the composer, `form.requestSubmit()`), assert on
     localStorage/Dexie/stores — import app modules in the page via
     `await import('/src/lib/days.ts')` etc. (Vite dev graph).
   - **Clean up after**: remove the fake key, empty the chat, delete any test
     days from the `days` store, clear test comms.
6. Reacts: add a TEMP `window.__fireReact = fire` hook to test, **remove it
   before commit**. Freeze mid-animation for screenshots:
   `document.getAnimations().forEach(a => { a.pause(); a.currentTime = N })`
   (suppress long `setTimeout`s first if the cleanup would race you).
7. Anything touch/scroll/gesture: preview proves layout, only the iPhone
   proves feel. Say so explicitly and ask for a phone check.

---

## 10. Runbooks

**Deploy (server)** — from `planner/`: `supabase db push`, then
`supabase functions deploy <name>` per changed function. Needs
`supabase login` (or `SUPABASE_ACCESS_TOKEN`) — often absent in the session
environment; if so, hand Ash the exact commands. Smoke-test `messages-sync`
with a **throwaway sync key** (never the real one — test rows are permanent
and would merge into her chat). A FK error from `schedule-push` with a fake
install_id = deployed and healthy.

**Add a react** — React Studio → Export → paste 6 sections; or hand-write
following any existing react. Always: whitelist (`REACT_IDS`) + a roster
entry in `reactRoster.ts` (perennial, or `when: { seasons/themes }` for a
guest star).

**Add a theme** — `themes.json` entry (copy `day`'s key set; keep rgba format
on surfaces; dark themes need `--app-bg` luminance < 0.45), dropdown option in
`App.svelte`, canopy flag in `envTheme.ts` if it has weather, choice-only =
just don't wire it into the auto logic.

**Add a companion action** — type union in `ChatMessage.actions`, schema block
+ any core rule in the prompt, `executeActions` branch (with per-field guards
— partial data must no-op, see landmine 12), decide whether the heartbeat
whitelist (`show_notification`/`schedule_notification` only) should include it
(default: no).

**Add a Dexie table/index** — new `this.version(n+1).stores({...})` with the
FULL schema map (additive only). Unindexed fields need no version bump.

**Debug vault sync** — the settings tip line shows last result; changing the
sync key resets the cursor (full re-pull, dedupes by id); curl the endpoint
with a throwaway key to isolate server vs client.

**Sovereign bridge** — `vault_sync.py` posts `st_<chat_id>_<index>` ids after
every `save_chat`; fire-and-forget; env: `VAULT_URL/VAULT_ANON_KEY/
VAULT_SYNC_KEY`. The planner-side key must MATCH (paste, not regenerate).

---

## 11. Known nits & loose ends (as of 2026-07-07)

- **Sovereign Terminal's original Supabase project is ACTIVE again**
  (2026-07-10: it was paused, not deleted, and has been revived). Its `.env`
  may not need repointing after all — check which DB it's actually using and
  whether migration 0003's tables on the planner project are now redundant.
  Still true: its `.env` is tracked in its git — `git rm --cached .env` +
  `.gitignore` before that repo travels anywhere.
- **Server deploy state verified 2026-07-10**: all functions deployed and
  live; heartbeat migrated to the Gemini ladder and confirmed speaking
  end-to-end (`spoke:true`, push delivered). parse-command's proxy model id
  fixed (`gemini-3.1-pro-preview`) — deployed, but pro-preview was riding a
  503 demand wave at verification time; it self-recovers, and chat uses the
  client key anyway.
- ~~`BEAM_TOKEN` secret is still the docs placeholder~~ **RESOLVED
  2026-07-10**: Ash set the real token; the server heartbeat now has glucose
  context (confirmed — it messaged her worried when it briefly couldn't see
  CGM data, which is the feature working).
- **Placeholder-secrets incident (2026-07-10)**: `HEARTBEAT_SYNC_KEY` had
  been the literal docs placeholder since setup — every heartbeat message
  archived to an unreadable bucket. Rows were rescued by migrating
  `sync_key` server-side; the function now refuses `<…>` values loudly. If
  vault messages ever "vanish" again, audit bucket keys first.
- **Occasional mid-session freeze on iPhone (reported 2026-07-16, cause
  unconfirmed)**: best theory is WebKit memory pressure against the
  dev-server app over the tunnel (unminified module graph + HMR client).
  The slow relaunch half ("long black then long white screen") WAS
  diagnosed: no SW shell cache + full re-stream through a cold tunnel —
  fixed 2026-07-16 (sw.js shell caching + the `npm run phone` runbook). If
  freezes persist once she's daily-driving a built app, investigate
  on-device with evidence, not theory.
- Old TEMP debug: `dialDebug` in `cycle.ts` + traces in `CycleDial.svelte` +
  `.hint.debug` in `CycleEditor.svelte` — still present, safe first task.
- A label somewhere still reads stale cycle-day text after the cycle position
  changes (dial itself is fine; look OUTSIDE `CycleDial.svelte`).
- Regenerate button re-asks on text only (attachments aren't replayed).
- Benign build noise: gcal dynamic-import warning; >500kB chunk warning;
  react-studio `npm audit` moderates.
- iPhone touch-verify whenever the vibes sheet / scroll containment changes.

---

## 12. How to be

Verify before you claim; show the proof (screenshot, store dump, payload).
One coherent change per commit, committed as soon as it's green — sessions
end without warning here. Prefer the smallest structure that solves the whole
problem; reuse the house patterns (they were paid for in debugging). When a
spec arrives from the companion, honour its intent, adapt its physics with
judgment, and report the deltas. When something is Ash's — a palette value, a
vibe hex, the heartbeat's voice — it is not yours to correct. Flag risks
plainly, including the ones you created and caught. And keep the warmth: this
codebase is a home someone lives in, not a product. Leave every room nicer
than you found it, and say goodnight when you go.
