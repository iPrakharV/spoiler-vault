# Media notes

All artwork is our SVG work and captures of our own app. The game text is original.
The banner and social card use the locally stored IBM Plex Sans files. The title
uses weight 600. Letter outlines are written as SVG paths, so GitHub does not need
to load a font. The font license files remain in shared/fonts.

The GIF uses a real `replay --offline --auto` session. The cut shows a spoiler
being caught, that prediction opening at beat 3, and the awarded leaderboard.
The overlay is recorded over our own game. The separate overlay screenshots use
a dark checkerboard so transparency is visible. No third-party footage or audio
is included.

## Rebuild on this Mac

Use Node 20. These authoring dependencies stay in ignored work/ and do not affect
the app's install.

```sh
npm install --prefix work/media-tools --no-save @ffmpeg-installer/darwin-arm64 opentype.js mermaid github-markdown-css
node scripts/build-brand.mjs
node scripts/capture-media.mjs
node scripts/encode-demo.mjs
```

The encoder makes an H.264 MP4, generates a GIF palette, then applies that palette
in a second ffmpeg pass. The GIF is 1200px wide and loops. The builder checks its
length and byte size. Source recordings and palettes stay in work/.

For a README check, write a JSON payload containing README.md as text, mode gfm,
and context iPrakharV/spoiler-vault. Render it with the GitHub Markdown API to
work/readme-rendered.html, then run scripts/verify-readme.mjs. It uses GitHub
Markdown CSS, renders the diagram, checks every image, and captures light and
dark pages in work/readme-checks. Public badges are fetched from shields.io;
the README retains their public URLs.

The record is in docs/verification/media.json and docs/verification/readme.json.
Upload docs/media/social-preview.png by hand under repository Settings, General,
Social preview. The YouTube URL and team/session fields are intentionally left
for the team to fill in.
