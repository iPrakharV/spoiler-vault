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
