# Project brief

Streamers playing story games spend too much time dodging spoilers and advice.
A game title alone is not enough context. The guard needs to know what the
streamer has already seen.

Spoiler Vault tracks the current beat. Past talk passes. Future spoilers are
deleted during Twitch's six second non-mod chat delay and stored with author,
text, target beat and timestamp. The reply is `@user sealed until the reveal`.
When the streamer reaches that beat, the overlay reads those messages back with
their age and author. Revealed messages earn Prophet points.

Unrequested advice goes into a hint jar. The broadcaster types `!hint` to release
one hint, vaguest first. The dashboard shows safe chat, counts and story progress.
It never renders held spoiler text.

The demo uses our original six-beat lighthouse mystery, The Orison file. It has
two puzzles and a late reveal. No third-party game footage, art or audio is used.
Other games use their own story map JSON.

Requirements:

- Work on a regular non-Affiliate Twitch account. Confirm with a real login.
- Replay without Twitch. `--offline` uses no API key.
- Evaluate about 150 labeled messages. Report per-class precision, recall, F1,
  a confusion matrix, and latency p50 and p95.
- Give judges a setup they can follow in ten minutes.
- Use Node 20, TypeScript, Express, ws, better-sqlite3 and OpenAI structured outputs.
- Serve plain HTML, CSS and JavaScript for dashboard, overlay and game.
- Use direct copy. No long dash characters. Do not commit secrets.

Deadline: Nov 2, 2026, 2:00pm PT. Environment values stay in ignored `.env`.
`.env.example` lists the required names and public defaults.
