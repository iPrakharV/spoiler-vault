# Spoiler Vault

Progress-aware chat guard for the Codex x TwitchCon hackathon.
Deadline: Nov 2, 2026, 2:00pm PT.

Use Node 20 (`nvm use`), then `npm ci`. Run `npm run dev` and open
http://localhost:3000/api/health. It should return `{"ok":true}`.
For a compiled run: `npm run build && npm start`.

Copy `.env.example` to `.env` before connecting Twitch. Never commit `.env`.
The app listens on loopback. Keep it local.

See docs/BUILD_LOG.md for each commit's manual checks.
