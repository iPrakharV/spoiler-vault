# Build checks

Docs: `git show 18abc96:docs/BRIEF.md` and `git show 18abc96:docs/CONTRACT.md`.

1. Scaffold: Node 20, `npm ci`, `npm run check`, `npm run build`, `npm start`.
   Open http://localhost:3000/api/health and expect `{"ok":true}`.

2. OAuth: register a Twitch confidential app with redirect
   `http://localhost:3000/auth/callback`. Copy `.env.example` to `.env`, fill Twitch
   values, restart, open `/auth/login`, and sign in as TWITCH_CHANNEL's owner.
   Expect a redirect to `/dashboard/` and `.data/twitch-tokens.json` with mode 600.
   Opening `/auth/callback?code=fake&state=fake` must return 400.

3. EventSub: after OAuth, expect `connected` in the terminal. In Twitch chat
   settings, verify non-mod delay is 6 seconds. Send a message from a second,
   non-mod account; expect `Chat received from <login>`. Disconnect the network
   briefly, restore it, and expect `reconnecting_gap` then `connected`.
   Twitch does not replay messages lost during a network drop.

4. Pipeline: connect Twitch, set OPENAI_API_KEY, add story/story-map.json (step 8
   provides the placeholder). Send a future secret from a non-mod account and
   expect deletion plus `@user sealed until the reveal`. Send advice and expect
   `@user saved to the hint jar`. Social chat passes. Remove OPENAI_API_KEY and
   restart; non-broadcaster messages should be deleted and counted as pending at
   `/api/status`. Inspect `.data/live.sqlite` locally. No held text is sent to ws.
   Bot replies use the broadcaster's identity, so their echoes are skipped.

5. Progress: with a message sealed for b3, run
   `curl -H 'Content-Type: application/json' -d '{"beatId":"b3"}' http://localhost:3000/api/progress`.
   Expect `{"currentBeat":"b3"}`, a reveal event, lower vault count and updated
   leaderboard. Repeat it and check points stay fixed. Unknown beats return 400;
   going backwards returns 409. A jump releases earlier beats too.
