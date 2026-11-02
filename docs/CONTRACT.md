# Integration contract

Prakhar owns server, dashboard and eval. The teammate originally owned game,
overlay, story and fixtures. This polish pass builds those folders too.

The story map at `/story/story-map.json` has this shape:

```ts
{ game: string, beats: [{ id: string, order: number, chapter: string, summary: string, secrets: string[] }] }
```

The game sends `POST http://localhost:3000/api/progress` with `{"beatId":"b3"}`.
The response is `200 {"currentBeat":"b3"}`. Its puzzle endpoint validates a choice
before advancing. The dashboard can advance a beat directly.

Connect to `ws://localhost:3000/ws`. Dashboard adds `?role=dashboard`. Each event
has a `type` discriminator and exactly the fields below. No telemetry fields are
added to these events.

| Type | Fields |
| --- | --- |
| status | `{currentBeat, vaultCount, jarCount}` |
| sealed | `{user, beatId, at}` |
| reveal | `{beatId, items:[{user, text, sealedAt}]}` |
| hint | `{text, user, level}` |
| leaderboard | `{entries:[{user, points}]}` |
| chat | `{user, text, label}`; dashboard only |

`sealed` never includes original message text. Dashboard caught-message rows,
latency stats, redacted vault lengths and jar levels come from `/api/desk`.
`/api/session` hides future chapter names and summaries. `/api/awards` supplies
first-call authors for reached beats without changing the reveal event.

Classifier output:

```ts
{ label: 'normal' | 'past_talk' | 'future_spoiler' | 'backseat',
  beatId: string | null, confidence: number, hintLevel: number | null }
```

Confidence is between 0 and 1. Hint level is 1 to 5 for advice, otherwise null.
Future spoilers must target an unreached beat. If a message contains several
future facts, use the latest beat needed to make the whole message safe.

Points: +1 per revealed sealed message. +3 for the first person to seal each
beat, awarded once when that beat is reached. Reveals are sorted by sealedAt.
