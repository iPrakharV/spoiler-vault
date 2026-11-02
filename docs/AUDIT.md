# Polish audit

This records the brief and contract line by line. Status describes the current
implementation. External checks stay partial until they can actually run.

## Brief and contract

| Requirement | Status | File | Notes |
| --- | --- | --- | --- |
| Guard story chat against future spoilers and backseating | done | server/pipeline.ts | Same pipeline in live and replay modes. |
| Know the current story beat | done | server/store.ts, server/controls.ts | Stored in SQLite. Progress moves forward. |
| Allow past story talk | done | server/classifier.ts | Reached summaries are sent without future secrets mixed into them. |
| Catch future story talk | done | server/classifier.ts | Future summaries and secrets are sent to structured-output classification. |
| Six second non-mod chat delay | done | server/eventsub.ts | Enabled before the subscription starts. |
| Delete, store and acknowledge future spoilers | done | server/pipeline.ts, server/store.ts | Stores author, text, target beat and timestamp. Failure to delete is reported. |
| Reply with the requested sealing text | done | server/pipeline.ts | Uses the broadcaster identity. Echoes are skipped. |
| Reveal on reaching a beat | done | server/controls.ts, overlay/app.js | Earlier eligible beats release in timestamp order too. |
| Show age and author on reveal | done | overlay/app.js | Computed from sealedAt. |
| Prophet points and overlay leaderboard | done | server/store.ts, overlay/app.js | Persistent points. No double awards. |
| Hold unsolicited advice | done | server/pipeline.ts | Hint text stays out of the safe feed until requested. |
| Broadcaster !hint releases the vaguest next hint | done | server/controls.ts | Hint level, then age. One item per request. |
| Dashboard safe chat, counts and current beat | done | server/store.ts, dashboard/app.js | Sanitized HTTP feed includes caught-message metadata only. |
| Original game footage only | done | game/, story/game-scenes.json | Original lighthouse mystery. No external art or audio. |
| Game-agnostic story map | done | story/story-map.json, server/story.ts | Six real beats. Validated IDs and orders. |
| Regular non-Affiliate Twitch account | partial | server/twitch.ts, server/eventsub.ts | No Affiliate-only API. Real account login and deletion still need credentials. |
| Replay without Twitch | done | server/replay.ts | Fresh in-memory SQLite session. |
| Offline replay without an API key | done | server/replay.ts | Stored labels. Timeout fixture is explicit. No fetch calls. |
| About 150 labeled eval messages | done | fixtures/eval.jsonl | 150 unique synthetic examples for this story. |
| Per-class precision, recall and F1 | done | eval/metrics.ts, eval/run.ts | Pending predictions count as misses. |
| Confusion matrix and p50/p95 latency | done | eval/run.ts | Classification latency, including failed calls. |
| Actual OpenAI eval run | partial | eval/results.md | npm run eval was attempted. No OPENAI_API_KEY is configured. Offline baseline is clearly marked. |
| Judge setup within ten minutes | done | README.md | Key-free quickstart first. |
| Node 20, TypeScript, Express, ws and SQLite | done | package.json, server/ | Checks use Node 20. |
| OpenAI structured outputs with timeout | done | server/classifier.ts | Strict schema, 3.5 second maximum. |
| Plain HTML, CSS and JavaScript screens | done | dashboard/, overlay/, game/ | Shared design file under shared/. |
| Plain copy and no long dash character | done | docs/, README.md | Rechecked in phase 3. |
| Secrets excluded from git | done | .gitignore, .env.example | Environment and token/data paths are ignored. History scan records no key material. |
| Complete environment example | done | .env.example | All six settings, including PORT=3000. No secret values. |
| Folder ownership | done | docs/CONTRACT.md | This pass also builds the teammate folders at the user's request. |
| Exact story map fields | done | story/story-map.json | game; beats with id, order, chapter, summary and secrets. |
| POST /api/progress request and response | done | server/controls.ts | beatId in, currentBeat out. Invalid or backward moves reject. |
| status event fields | done | server/pipeline.ts | Only type, currentBeat, vaultCount and jarCount. Telemetry moved to HTTP. |
| sealed event fields | done | server/pipeline.ts | Only type, user, beatId and at. No original text. |
| reveal event fields | done | server/controls.ts | Only type, beatId and items with user, text and sealedAt. |
| hint event fields | done | server/controls.ts | Only type, text, user and level. |
| leaderboard event fields | done | server/store.ts, server/controls.ts | Only type and entries with user and points. |
| chat event fields and visibility | done | server/pipeline.ts, server/broadcast.ts | Only type, user, text and label. Dashboard role only. |
| Classifier labels and nullable fields | done | server/types.ts, server/classifier.ts | Runtime validation checks target beat and hint level. |
| +1 per reveal and +3 per beat's first author | done | server/store.ts | Atomic release and persisted bonus marker. |

## Initial commands

- Typecheck passed.
- All 23 existing tests passed. After fixes, 24 tests passed.
- Offline replay passed.
- npm run eval stopped with a clear missing-key error. No model results were invented.
- Offline baseline ran on the replacement story.

## Verification record

Phase 3 adds the screenshot checklist, deviations and final command results here.

Phase 1: typecheck, 24 tests, offline replay and baseline eval passed. Credential
pattern scan of git history and tracked paths passed. All six environment entries
are present. Model eval and real Twitch checks remain credential-dependent.

## Phase 2

The three screens now share the requested colors, radii, border rules and IBM
Plex families. Fonts came from Google Fonts and are served locally with licenses.
The dashboard uses safe HTTP metadata for caught rows and never adds held text
to the DOM. Future steps use only their beat number. N and H control progress
and hint release. The overlay includes queued toasts, timed reveal items,
first-call tags, hints, leaderboard and reduced-motion alternatives.

Typecheck passed after the redesign. One of 24 tests still expected the old chat
heading. Phase 3 updates that routing assertion to check the HTML response and
chat container instead of copy. Screenshot inspection follows
in phase 3. Live service checks remain the two external items marked partial.

## Screenshot deviations

| Pass | Deviation | Fix | Status |
| --- | --- | --- | --- |
| 1 | Next beat was clipped at 1280x800. | Reserved 288px for story progress and prevented action rows from shrinking. Added a button containment assertion. | fixed |
| 1 | The captured feed did not show a past-talk tag. | Added a safe b1 fixture row and checked that the tag is visible. | fixed |
| 2 | An ending reaction could appear early in manual replay. | Replaced it with a line that is safe at every beat. | fixed |
| 3 | The hint panel could retain a previously released hint. | Persist the most recently released hint ID; test its exact text after H. | fixed |
| 1 | The routing test depended on an old heading. | Assert the HTML type and chat container instead of copy. | fixed |

The first seven screenshots were opened and inspected. The changes above were
recaptured and rechecked before sign-off. The overlay shots show a dark checker pattern
behind the transparent page; that pattern is injected only by the capture script.

## Final visual checklist

All seven regenerated images were opened and inspected after the fixes. No
unaddressed visual deviations remain. Scrollable chat and vault lists can show a
partial row at their scroll edge; action buttons are fully contained at both
required dashboard sizes.

| Requirement | Status | Evidence |
| --- | --- | --- |
| One shared token file for all screens | done | shared/tokens.css; all three HTML files load it. |
| All nine requested color values | done | Browser checks compare all token values. |
| Cards at 6px, buttons and tags at 4px, 1px borders | done | Shared rules and visual inspection. |
| IBM Plex Sans 400/500/600 | done | Locally served Google Fonts files; dashboard capture and font check. |
| IBM Plex Sans Condensed 600/700 | done | Overlay headings; reveal capture. |
| IBM Plex Mono 400/500 and tabular numbers | done | Counts, timestamps, stats and overlay metadata. |
| Base dashboard 15px and line height 1.45 | done | Computed browser styles are asserted. |
| Small original inline SVG icons, currentColor, stroke 1.5 | done | shared/icons.js and shared/tokens.css. |
| Sentence case and direct copy | done | Screen, README and docs inspection. Brand names keep their spelling. |
| 56px top bar, channel, connection and beat | done | Both dashboard captures; measured header height. |
| Green live, amber replay, gray offline indicator | done | State rules in dashboard/app.js and dashboard/style.css. |
| Two columns with 380px right column and 16px spacing | done | Browser bounds at 1440x900 and 1280x800. |
| No horizontal page scroll or clipped controls | done | Page width and button containment assertions at both sizes. |
| Full-height chat with timestamps and stable user colors | done | Both dashboard captures. |
| 8px row padding and separators | done | dashboard/style.css and visual inspection. |
| Auto-follow stops when the reader scrolls up | done | Browser preserves scrollTop through polling. |
| Jump to latest restores following | done | Browser button check. |
| Sealed, advice and pending rows hide original text | done | HTTP redaction test, DOM check and captured rows. |
| Caught-row border colors and tints | done | Dashboard captures and CSS inspection. |
| Past talk gets the small past tag | done | Visible safe fixture row in both captures. |
| Processed, sealed, hints, average and p95 stat strip | done | Both captures; classification time comes from the store. |
| Stepper with done checks, current bar and generic future labels | done | Both captures and future-label assertions. |
| N advances one beat | done | Browser keyboard check. |
| Vault count, metadata and length-based redaction bars | done | Captures and safe HTTP metadata. |
| Jar count, five level pips and release action | done | Both captures and hint count assertions. |
| H releases one hint and shows that exact hint | done | Browser text assertion plus the release-order regression test. |
| Plain empty states | done | Initial HTML and empty-list rendering inspected. |
| Transparent 1920x1080 overlay with 48px safe margins | done | Computed background and scene bounds. Checker is capture-only. |
| Bottom-left count panel, 22px mono and 150ms number bump | done | Four overlay captures and animation-duration assertion. |
| Toast at top-right, width 420px and seal icon | done | overlay-toast.png and browser bounds. |
| One queued toast, 220ms slide and 3.5 second timer | done | Timed browser check of two queued events. |
| Reveal width 1824px and height 260px | done | overlay-reveal.png and browser bounds. |
| Uppercase condensed 44px reveal heading and red beat | done | Reveal capture and CSS inspection. |
| Two seal halves move over 500ms | done | Reveal capture and animation-duration assertion. |
| Message types at about 40 characters per second | done | overlay/app.js; longer text speeds up to fit the item time. |
| One item at a time, five seconds per item | done | Timed browser check. |
| At most five items, then the remaining count | done | Seven-item browser event shows item five and +2. |
| Age, author and first-call tag | done | Reveal capture and reached-beat award metadata. |
| Left hint card, width 520px and 28px text | done | overlay-hint.png and browser bounds. |
| Hint level label and eight second lifetime | done | Hint capture and timed browser check. |
| Five-row leaderboard after reveal, six second lifetime | done | overlay-leaderboard.png and timed browser check. |
| Transform/opacity motion and reduced-motion fades | done | CSS inspection and browser media emulation. |
| Demo cycles without API or WebSocket calls | done | Demo branch uses local sample events. Four scene previews captured. |
| Original six-beat lighthouse mystery | done | story/story-map.json and story/game-scenes.json. |
| Case-file layout, max 64ch and bordered choices | done | game.png and game/style.css. |
| Puzzles at 2 and 4, twist at 5, ending at 6 | done | Browser plays the choices and checks both wrong answers. |
| Game progress uses the contract endpoint | done | game/app.js and server/game.ts. |
| Required README sections and diagram | done | README.md in the requested order. |

## Capture files

- screenshots/dashboard-1440.png
- screenshots/dashboard-1280.png
- screenshots/overlay-reveal.png
- screenshots/overlay-hint.png
- screenshots/overlay-toast.png
- screenshots/overlay-leaderboard.png
- screenshots/game.png

The dashboard captures follow 34 processed replay messages, including sealed,
advice, pending and past-talk rows. The machine-readable browser report is
screenshots/verification.json. It includes measured bounds and timing results.
The headless browser runs in single-process mode because the normal multi-process
launch cannot register its macOS process service inside this sandbox.

To repeat the captures, stop the running app first, use Node 20, then run:

```sh
PLAYWRIGHT_BROWSERS_PATH="$PWD/work/browsers" node node_modules/playwright/cli.js install chromium-headless-shell
npm run verify
```

The script starts offline replay, captures and checks the screens, then stops its
own server. It records failures rather than leaving a passing report on error.

## Final command results

| Command | Status | Result |
| --- | --- | --- |
| npm run typecheck | done | Passed with Node 20. |
| npm test | done | 26 passed, zero failed. |
| npm run build | done | Compiled successfully. |
| npm run replay -- --offline | done | Scripted smoke run reached b6. Vault empty, three hints remain. |
| npm run eval | partial | Attempted again. Exit 1 because OPENAI_API_KEY is not set. |
| npm run eval -- --offline | done | All 150 examples evaluated with the marked heuristic baseline. |
| npm run verify | done | All browser checks passed. All seven images opened and inspected. |

The fast smoke run adds --speed=1000 and --exit. It uses port 3001 while the
capture server uses 3000. The server left running for the user uses normal-speed
manual offline replay on 3000, so the game controls its own progress.

The empty database from the earlier sample story was archived under ignored
.data-archive. No user messages or points were in it. This lets live mode start
with the new story without mixing old beat definitions.

Advice naming an unreached beat is held as pending. It cannot enter the jar.
The last released hint ID is now persisted, so insertion order cannot overwrite
the hint just requested. Both changes have regression tests.

The only remaining partial checks are real Twitch account behavior and OpenAI
model evaluation. Neither can be completed without the project credentials.

Final source copy scan: zero banned-copy or long-dash hits. Credential pattern
scan of tracked text and git history found no secrets. Environment, token, archive
and scratch paths are ignored. The environment example has exactly six settings.
