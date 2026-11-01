# Build checks

Docs: `git show 18abc96:docs/BRIEF.md` and `git show 18abc96:docs/CONTRACT.md`.

1. Scaffold: Node 20, `npm ci`, `npm run check`, `npm run build`, `npm start`.
   Open http://localhost:3000/api/health and expect `{"ok":true}`.
