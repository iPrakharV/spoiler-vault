# Spoiler Vault

A progress-aware chat guard for story games. It seals future spoilers, holds
unsolicited advice, and gives chat credit when the streamer reaches the reveal.
Built for the Codex x TwitchCon hackathon. Deadline: Nov 2, 2026, 2:00pm PT.

## Try it in 10 minutes

Use Node 20. If you use nvm, run `nvm use` in this folder.

```sh
cd ~/spoiler-vault
npm ci
npm run replay -- --offline
```

Open [the streamer desk](http://localhost:3000/dashboard/) right away. The replay
starts after two seconds and lasts about 30 seconds. It uses a fresh in-memory
SQLite database. No Twitch account, OpenAI key, art download, or audio is needed.
This is a fixture replay, not a test of AI accuracy.

Watch two spoilers enter the vault and two pieces of advice enter the jar. The
broadcaster asks for a hint, and the vague one comes out first. The replay reaches
b2, b3 and b4, releases the sealed messages, and awards Prophet points. Final
points are maya 8, niko 4, rowan 1. One explicit hint stays in the jar. The server
stays open so you can inspect the dashboard and release that last hint.

Stop with Ctrl+C. Each replay starts fresh. For a quick terminal smoke check:

```sh
npm run replay -- --offline --speed=1000 --exit
```

To test the real classifier without Twitch, put OPENAI_API_KEY in `.env` and run
`npm run replay`. It uses the same fixture text and story progress, but ignores
the stored labels and asks OpenAI instead.

## Connect a Twitch channel

1. Register a confidential application in the
   [Twitch developer console](https://dev.twitch.tv/console/apps).
   Set the OAuth redirect URL to `http://localhost:3000/auth/callback` exactly.
   This flow uses the broadcaster's own account, including for bot replies.
2. Copy `.env.example` to `.env`. Set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET,
   TWITCH_CHANNEL to your channel login, and OPENAI_API_KEY. OPENAI_MODEL defaults
   to gpt-4o-mini and can be changed to a model supporting structured outputs.
   Keep PORT=3000 for the registered callback URL.
3. Run `npm run dev`. For a compiled run: `npm run build && npm start`.
4. Open [Connect Twitch](http://localhost:3000/auth/login), sign in as the channel
   owner, and grant the four scopes: user:read:chat, user:write:chat,
   moderator:manage:chat_messages, moderator:manage:chat_settings.
5. Check that the terminal says `Twitch: connected`. The app enables a six second
   non-moderator chat delay before subscribing to chat. No Affiliate-only API
   or subscription feature is used.
6. From a separate non-moderator account, send `The keeper is your future self.`
   while the dashboard is at b1. Expect deletion, a sealed count, and
   `@user sealed until the reveal`. Send `Maybe look around a little more.` to
   fill the hint jar. Social chat should appear in the safe feed.
7. Advance to b3 with the dashboard button or game progress endpoint. Expect a
   reveal event and Prophet points. Type `!hint` as the broadcaster or press
   Release a hint. Viewer commands do not release advice.

Twitch tokens are saved in `.data/twitch-tokens.json` with mode 600 and refreshed
before expiry. They are validated at startup and hourly. The file, SQLite data,
`.env`, node_modules, build output and scratch work are ignored by git. `.env.example`
contains names and defaults only. Do not put keys into fixtures or story maps.

Keep the app on localhost. It binds to 127.0.0.1. Dashboard controls and the game
progress endpoint are local controls, with Host and Origin checks. They are not
an internet-facing authenticated service.

## Teammate integration

Ownership is in docs/CONTRACT.md. Server, dashboard and eval are implemented.
`story/story-map.json`, `fixtures/demo-chat.json` and `fixtures/eval.jsonl` are
replaceable placeholders for the original story. `/game` and `/overlay` are
served if those folders exist. Their implementation belongs to the teammate.
No third-party game footage, art, or audio is included.

The story map is validated and sorted by beat order. IDs and orders must be
unique. The initial beat is the first beat. Progress is monotonic. A jump releases
all eligible vault items, sorted by sealedAt. Repeating a progress request is
safe. Each revealed message earns +1, and the first person to seal each beat gets
+3 when that beat is revealed. The bonus is stored once, across restarts.

The live SQLite database persists current progress, holds, points and latency.
If the story map changes, stop the server and rename the old `.data` folder to `.data-archive`
before starting the new story. This also requires a new Twitch login. The app
refuses to mix held messages from different story maps. Replay needs no reset.

```sh
curl -H 'Content-Type: application/json' \
  -d '{"beatId":"b3"}' http://localhost:3000/api/progress
curl -X POST http://localhost:3000/api/hint
```

Game pages served from `/game` can use relative fetch paths. For a game hosted
on another origin, send progress from its local backend, not a cross-origin
browser page. A successful progress call returns `{"currentBeat":"b3"}`.
Unknown beats return 400, backward progress returns 409.

Overlay connects to `ws://localhost:3000/ws`. Dashboard uses
`ws://localhost:3000/ws?role=dashboard`. Every event has a top-level `type` plus
the fields in CONTRACT.md, for example:

```json
{"type":"reveal","beatId":"b3","items":[{"user":"niko","text":"The keeper is your future self.","sealedAt":"2026-11-01T12:00:00.000Z"}]}
```

A progress jump sends one reveal event whose beatId is the reached beat, with all
newly eligible items in timestamp order. Overlay can compute "Sealed 47 min ago"
from sealedAt and display the leaderboard event. The server sends a fresh status
and leaderboard snapshot on each WebSocket connection. Reveal animations are
transient; a disconnected overlay does not replay missed animations.

Safe `chat` and operational `connection`/`warning` events go only to dashboard
connections. `sealed` never contains message text. `status` also includes
pendingCount. `/api/session` returns chapter labels and only the reached beat's
summary. Give chapters spoiler-free names. `/api/status` exposes mode,
classifier readiness and Twitch connection state. `/api/health` checks the process.

## Evaluation and checks

```sh
npm test
npm run check
npm run build
npm run eval -- --offline
# With OPENAI_API_KEY:
npm run eval
```

Eval reads 150 unique, hand-labeled synthetic messages from fixtures/eval.jsonl.
They cover social chat, past reveals, future reveals, advice, misleading guesses,
multi-beat spoilers, prompt injection, and literal HTML. Replace and review them
when the story changes. They are not production traffic or an independent
benchmark of unseen games.

The harness prints per-class precision, recall and F1, a confusion matrix, correct
future-spoiler target count, and classifier latency p50/p95. It writes
`eval/results.md` and per-row predictions to `eval/results.json`. Errors and
low-confidence outputs count as pending predictions and as false negatives.
Latency includes errors/timeouts and uses nearest-rank percentiles. It excludes
Twitch deletion and chat replies. Live pipeline latency is logged as JSON and
stored in the SQLite latency table.

`eval --offline` runs a small deterministic heuristic that does not read the gold
labels. Its saved results are clearly marked BASELINE, not OpenAI quality or
latency. Live model results require a key. Eval does not silently substitute the
baseline when the API fails.

Tests use local mocks for OAuth, OpenAI and EventSub, plus real HTTP, WebSocket
and SQLite connections. Manual checks for every build step are in
`docs/BUILD_LOG.md`.

## Failure behavior and current limits

Classification uses OpenAI structured outputs, a 3.5 second maximum, and a 0.65
confidence threshold. The budget shrinks for late EventSub deliveries to leave
time for deletion. API failures, refusals, invalid target beats and uncertain
outputs are deleted and stored as pending. Pending items stay private in SQLite;
they are counted on the dashboard and do not auto-release or earn points.
There is no pending-review UI yet.

The app attempts deletion before the six second delay expires. It cannot promise
that every message is caught: delivery delays, Twitch API errors/rate limits,
moderator exemptions and network gaps can let messages appear. A delete failure
produces a dashboard warning and leaves a record with deleted=0. Do not use the
unfiltered Twitch chat panel as the streamer's safe feed. Twitch does not replay
messages missed during a dropped EventSub connection. Reconnects keep subscriptions
when Twitch supplies a reconnect URL; fresh connections subscribe again.

Live OAuth, real non-Affiliate chat deletion and model quality still need a
credentialed end-to-end run. Local tests use mocked service responses. The
six-second Twitch setting stays enabled after shutdown; disable it in Twitch's
chat settings when you are done.

Official API references used:
[Twitch OAuth](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/),
[EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/),
[chat subscriptions](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channel-chat-message),
[chat settings and moderation](https://dev.twitch.tv/docs/api/reference/#update-chat-settings),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
