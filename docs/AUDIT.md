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
| Complete environment example | done | .env.example | All six requested keys and PORT=3000. No secret values. |
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
pattern scan of git history and tracked paths passed. All seven environment entries
are present. Model eval and real Twitch checks remain credential-dependent.
