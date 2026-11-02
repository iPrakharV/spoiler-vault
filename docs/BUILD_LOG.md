# Build checks

The first pass committed the brief, then ten implementation steps. The polish
pass adds three commits: audit and fixes, redesign, and verification.

Use Node 20. Run these from the repository root:

```sh
npm run typecheck
npm test
npm run build
npm run replay -- --offline
npm run eval
```

Model eval requires OPENAI_API_KEY. Without it, run `npm run eval -- --offline`
for the marked baseline. The normal command must not silently substitute it.

The detailed requirement table, initial command results, visual checklist and
remaining external checks are in AUDIT.md. Screenshots go in docs/screenshots/.
